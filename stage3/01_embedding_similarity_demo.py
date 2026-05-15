#!/usr/bin/env python3
"""
01_embedding_similarity_demo.py

Stage 3 demo: Embedding + Cosine Similarity + Top K retrieval.

对应学习文档：
    docs/stage3/01-Embedding与相似度检索.md

运行：
    python3 stage3/01_embedding_similarity_demo.py

可选：传入自己的问题
    python3 stage3/01_embedding_similarity_demo.py "我想报销差旅费用，需要准备什么？"

说明：
    真实 RAG 系统会调用 Embedding 模型，例如 text-embedding-3-small、
    bge-m3、gte、jina-embeddings 等，把文本变成几百到几千维向量。

    为了让这个 demo 不依赖外部 API，也方便学习和调试，这里实现了一个
    ToyEmbeddingModel：它不是生产可用模型，而是把文本映射到几个手写的
    “语义维度”。这样可以直观看到：

    1. 文本如何变成向量
    2. 查询向量如何与知识库向量计算相似度
    3. 为什么 Top K 结果可以作为 RAG 的上下文候选
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass


@dataclass(frozen=True)
class DocumentChunk:
    """知识库中的一个 Chunk。

    RAG 工程里通常不会直接把整篇文档送去检索，而是先切成 Chunk。
    每个 Chunk 至少需要保存：
    - chunk_id: 唯一标识，方便追踪和引用
    - content: 原始文本，最终会放进 Prompt 或展示给用户
    - source: 来源文件，方便做 citation
    - page: 页码或段落位置，方便定位原文
    """

    chunk_id: str
    content: str
    source: str
    page: int


@dataclass(frozen=True)
class IndexedChunk:
    """已经生成过 Embedding 的 Chunk。

    向量数据库里通常保存的就是类似结构：
    - 原始内容和元数据用于展示、过滤、引用
    - embedding 用于相似度计算
    """

    chunk: DocumentChunk
    embedding: list[float]


@dataclass(frozen=True)
class SearchResult:
    """一次相似度检索返回的结果。"""

    chunk: DocumentChunk
    score: float


class ToyEmbeddingModel:
    """一个教学用的 Embedding 模型。

    真实 Embedding 模型会通过神经网络学习语义关系。
    这里为了把原理讲清楚，手写几个语义维度：

    - leave: 请假、休假、年假
    - reimbursement: 报销、发票、差旅
    - ops: 服务器、报警、CPU、运维
    - security: 密码、权限、账号
    - meeting: 会议、预订、会议室
    - onboarding: 入职、工牌、电脑
    - approval: 审批、流程、提交

    当文本命中某个维度的关键词时，该维度的数值会变大。
    这可以模拟“语义相近的文本向量方向更接近”这个核心直觉。
    """

    def __init__(self) -> None:
        self.dimensions: list[tuple[str, tuple[str, ...]]] = [
            ("leave", ("年假", "休假", "请假", "假期", "调休")),
            ("reimbursement", ("报销", "发票", "差旅", "费用", "审批单")),
            ("ops", ("服务器", "报警", "CPU", "内存", "运维", "故障")),
            ("security", ("密码", "权限", "账号", "登录", "安全")),
            ("meeting", ("会议", "会议室", "预订", "投影", "日程")),
            ("onboarding", ("入职", "新人", "工牌", "电脑", "邮箱")),
            ("approval", ("审批", "流程", "提交", "申请", "系统", "OA")),
        ]

    def embed(self, text: str) -> list[float]:
        """把一段文本转换成向量。

        返回向量的每一个数字都对应一个语义维度。
        例如 [2, 0, 0, 0, 0, 0, 1] 可以粗略理解为：
        “这段文本强烈涉及请假，也轻微涉及流程/申请”。
        """

        vector: list[float] = []

        for _dimension_name, keywords in self.dimensions:
            score = 0.0
            for keyword in keywords:
                if keyword in text:
                    # 命中关键词后增加该语义维度的权重。
                    # 这里使用关键词长度做一点点加权：更具体的词贡献略高。
                    score += 1.0 + len(keyword) * 0.1
            vector.append(score)

        return vector

    def explain(self, embedding: list[float]) -> list[tuple[str, float]]:
        """把向量转换成适合学习观察的维度名称和值。"""

        return [
            (dimension_name, value)
            for (dimension_name, _keywords), value in zip(self.dimensions, embedding)
        ]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """计算两个向量的余弦相似度。

    公式：
        cos(theta) = dot(a, b) / (||a|| * ||b||)

    直觉：
        - 点积 dot(a, b) 越大，说明两个向量在相同维度上同时有较大值
        - 分母用于消除文本长短、关键词多少带来的规模影响
        - 结果越接近 1，方向越接近，语义越相似
    """

    if len(a) != len(b):
        raise ValueError("Vectors must have the same dimension.")

    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))

    # 如果文本没有命中任何语义维度，向量长度为 0，无法计算夹角。
    # 这里返回 0，表示和任何内容都没有可判断的相似度。
    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot_product / (norm_a * norm_b)


def build_demo_chunks() -> list[DocumentChunk]:
    """准备一组短文本，模拟企业知识库中的 Chunk。"""

    return [
        DocumentChunk(
            chunk_id="chunk_001",
            content="员工年假申请需要在 OA 系统提交，直属主管审批通过后生效。",
            source="员工手册.md",
            page=3,
        ),
        DocumentChunk(
            chunk_id="chunk_002",
            content="服务器 CPU 使用率持续过高时，应先查看报警详情并联系运维团队。",
            source="运维值班手册.md",
            page=8,
        ),
        DocumentChunk(
            chunk_id="chunk_003",
            content="差旅报销需要上传发票、行程单和审批单，财务会在三个工作日内处理。",
            source="财务制度.md",
            page=5,
        ),
        DocumentChunk(
            chunk_id="chunk_004",
            content="忘记登录密码时，可以在账号安全中心发起密码重置流程。",
            source="信息安全指南.md",
            page=2,
        ),
        DocumentChunk(
            chunk_id="chunk_005",
            content="会议室预订需要在日程系统中选择时间段，并确认投影设备是否可用。",
            source="行政服务手册.md",
            page=6,
        ),
        DocumentChunk(
            chunk_id="chunk_006",
            content="新人入职当天会领取工牌、电脑和企业邮箱账号。",
            source="入职指南.md",
            page=1,
        ),
        DocumentChunk(
            chunk_id="chunk_007",
            content="所有费用申请都需要先提交审批流程，审批完成后才能进入付款环节。",
            source="审批规范.md",
            page=4,
        ),
    ]


def index_chunks(
    chunks: list[DocumentChunk],
    embedding_model: ToyEmbeddingModel,
) -> list[IndexedChunk]:
    """给每个 Chunk 生成 Embedding，模拟“入库”过程。"""

    indexed_chunks: list[IndexedChunk] = []
    for chunk in chunks:
        embedding = embedding_model.embed(chunk.content)
        indexed_chunks.append(IndexedChunk(chunk=chunk, embedding=embedding))
    return indexed_chunks


def similarity_search(
    query: str,
    indexed_chunks: list[IndexedChunk],
    embedding_model: ToyEmbeddingModel,
    top_k: int = 3,
) -> tuple[list[float], list[SearchResult]]:
    """执行一次最小相似度检索。

    步骤和文档中的 RAG 检索流程一致：
    1. 用户问题 -> 查询向量
    2. 查询向量 vs 每个 Chunk 向量 -> 相似度分数
    3. 按分数排序 -> 返回 Top K
    """

    query_embedding = embedding_model.embed(query)

    results: list[SearchResult] = []
    for indexed_chunk in indexed_chunks:
        score = cosine_similarity(query_embedding, indexed_chunk.embedding)
        results.append(SearchResult(chunk=indexed_chunk.chunk, score=score))

    results.sort(key=lambda item: item.score, reverse=True)
    return query_embedding, results[:top_k]


def format_embedding(
    embedding_model: ToyEmbeddingModel,
    embedding: list[float],
) -> str:
    """把向量格式化成带维度名称的字符串，方便观察。"""

    pairs = embedding_model.explain(embedding)
    return ", ".join(f"{name}={value:.1f}" for name, value in pairs)


def print_index_overview(
    indexed_chunks: list[IndexedChunk],
    embedding_model: ToyEmbeddingModel,
) -> None:
    """打印知识库入库后的向量，帮助理解每个 Chunk 的语义位置。"""

    print("\n=== 1. Knowledge Base Chunks ===")
    for indexed_chunk in indexed_chunks:
        chunk = indexed_chunk.chunk
        embedding_text = format_embedding(embedding_model, indexed_chunk.embedding)
        print(f"\n[{chunk.chunk_id}] {chunk.content}")
        print(f"source={chunk.source}, page={chunk.page}")
        print(f"embedding: {embedding_text}")


def print_search_results(
    query: str,
    query_embedding: list[float],
    results: list[SearchResult],
    embedding_model: ToyEmbeddingModel,
) -> None:
    """打印检索结果，模拟 RAG 中给 LLM 的候选上下文。"""

    print("\n=== 2. Query Embedding ===")
    print(f"query: {query}")
    print(f"embedding: {format_embedding(embedding_model, query_embedding)}")

    print("\n=== 3. Top K Similarity Search Results ===")
    for rank, result in enumerate(results, start=1):
        chunk = result.chunk
        print(f"\nTop {rank} | score={result.score:.4f}")
        print(f"chunk_id: {chunk.chunk_id}")
        print(f"content : {chunk.content}")
        print(f"source  : {chunk.source}#page={chunk.page}")

    print("\n=== 4. RAG Context Candidate ===")
    print("下面这些片段就是后续 RAG Pipeline 可能放进 Prompt 的上下文：")
    for result in results:
        chunk = result.chunk
        print(f"- ({chunk.source} p.{chunk.page}) {chunk.content}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Embedding 与相似度检索教学 demo",
    )
    parser.add_argument(
        "query",
        nargs="?",
        default="我想休年假，应该在哪里提交申请？",
        help="要检索的用户问题",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=3,
        help="返回最相似的前几个 Chunk",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    embedding_model = ToyEmbeddingModel()
    chunks = build_demo_chunks()
    indexed_chunks = index_chunks(chunks, embedding_model)

    query_embedding, results = similarity_search(
        query=args.query,
        indexed_chunks=indexed_chunks,
        embedding_model=embedding_model,
        top_k=args.top_k,
    )

    print_index_overview(indexed_chunks, embedding_model)
    print_search_results(args.query, query_embedding, results, embedding_model)


if __name__ == "__main__":
    main()
