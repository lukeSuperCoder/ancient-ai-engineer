#!/usr/bin/env python3
"""
04_rag_pipeline_pgvector_demo.py

Stage 3 demo: RAG Pipeline with PostgreSQL + pgvector.

对应学习文档：
    docs/stage3/04-RAG Pipeline检索增强生成.md

前置步骤：
    psql -h localhost -p 5432 -U luke -d vector_db -f stage3/03_pgvector_schema.sql

运行：
    python3 stage3/04_rag_pipeline_pgvector_demo.py

可选：
    python3 stage3/04_rag_pipeline_pgvector_demo.py "年假超过三天需要谁审批？"
    python3 stage3/04_rag_pipeline_pgvector_demo.py "服务器报警怎么办？" --knowledge-base-id kb_it
    python3 stage3/04_rag_pipeline_pgvector_demo.py "公司班车几点发车？" --min-similarity 0.35

说明：
    这个 demo 建立在 stage3/03_pgvector_practice_demo.py 的表结构和数据写入函数上。
    它演示 RAG 的问答链路：

    1. 用户问题 -> ToyEmbeddingModel 生成查询向量
    2. PostgreSQL + pgvector 检索 Top K Chunk
    3. 根据相似度阈值过滤低质量结果
    4. 组装带来源编号的 RAG Prompt
    5. 用一个教学版生成器输出“只基于资料”的回答和引用

    真实项目中，第 5 步会替换成 LLM API 调用。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def load_pgvector_demo_module() -> Any:
    """加载第 03 课脚本，复用数据库连接、入库和向量检索函数。

    文件名以数字开头，不能直接使用普通 import 语法。
    所以这里用 importlib 从文件路径加载模块。
    """

    module_path = Path(__file__).with_name("03_pgvector_practice_demo.py")
    spec = importlib.util.spec_from_file_location("stage3_pgvector_demo", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module from {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


pgvector_demo = load_pgvector_demo_module()


@dataclass(frozen=True)
class RagSource:
    """RAG 回答使用的一条资料来源。"""

    index: int
    chunk_id: str
    document_id: str
    source: str
    page: int
    section: str
    content: str
    similarity: float
    metadata: dict[str, Any]


@dataclass(frozen=True)
class RagResponse:
    """一次 RAG Pipeline 的完整输出。"""

    question: str
    knowledge_base_id: str
    prompt: str
    answer: str
    sources: list[RagSource]
    retrieval_count: int
    used_count: int


def build_rag_prompt(question: str, sources: list[RagSource]) -> str:
    """把检索到的 Chunk 组装成 LLM Prompt。

    对应文档中的 Prompt Assemble：
    - 明确角色
    - 限制只能根据资料回答
    - 资料带编号
    - 来源、页码、章节清晰
    - 要求回答后列出引用
    """

    context_blocks: list[str] = []
    for source in sources:
        context_blocks.append(
            "\n".join(
                [
                    f"【资料 {source.index}】",
                    f"来源：{source.source}，第 {source.page} 页，章节：{source.section}",
                    f"相似度：{source.similarity:.4f}",
                    f"内容：{source.content}",
                ]
            )
        )

    context_text = "\n\n".join(context_blocks)

    return f"""你是企业知识库助手。
请只根据下面的资料回答用户问题。
如果资料中没有答案，请说“知识库中没有找到相关依据”。
回答后列出引用来源。

{context_text}

用户问题：
{question}
"""


def generate_teaching_answer(question: str, sources: list[RagSource]) -> str:
    """教学版 Generation。

    真实 RAG 会把 build_rag_prompt 的结果发送给 LLM。
    为了让 demo 不依赖外部 API，这里用规则生成一个“只基于资料”的回答：
    - 不使用资料外的常识
    - 每句话后面标注资料编号
    - 最后列出引用来源
    """

    if not sources:
        return (
            "知识库中没有找到足够依据回答这个问题。\n"
            "你可以尝试换一种问法，或上传相关资料后再提问。"
        )

    answer_lines = ["根据知识库资料，可以得到以下回答："]
    for source in sources:
        answer_lines.append(f"- {source.content}（资料 {source.index}）")

    answer_lines.append("\n引用来源：")
    for source in sources:
        answer_lines.append(
            f"- 资料 {source.index}: {source.source}，第 {source.page} 页，"
            f"章节：{source.section}，chunk_id={source.chunk_id}"
        )

    return "\n".join(answer_lines)


def run_rag_pipeline(
    *,
    question: str,
    knowledge_base_id: str,
    top_k: int,
    min_similarity: float,
    skip_seed: bool,
) -> RagResponse:
    """运行最小 RAG Pipeline。

    这个函数对应文档第 5 节的伪代码：
    - embed(question)
    - vectorStore.search(topK, filter)
    - buildRagPrompt(question, chunks)
    - llm.generate(prompt)
    - return answer + sources
    """

    embedding_model = pgvector_demo.ToyEmbeddingModel()

    with pgvector_demo.connect_db() as conn:
        if not skip_seed:
            pgvector_demo.seed_demo_data(conn, embedding_model)

        retrieved_rows = pgvector_demo.search_similar_chunks(
            conn,
            query=question,
            knowledge_base_id=knowledge_base_id,
            top_k=top_k,
            embedding_model=embedding_model,
        )

    filtered_rows = [
        row for row in retrieved_rows if float(row["similarity"]) >= min_similarity
    ]

    sources = [
        RagSource(
            index=index,
            chunk_id=row["chunk_id"],
            document_id=row["document_id"],
            source=row["source"],
            page=row["page"],
            section=row["section"],
            content=row["content"],
            similarity=float(row["similarity"]),
            metadata=row["metadata"],
        )
        for index, row in enumerate(filtered_rows, start=1)
    ]

    prompt = build_rag_prompt(question, sources)
    answer = generate_teaching_answer(question, sources)

    return RagResponse(
        question=question,
        knowledge_base_id=knowledge_base_id,
        prompt=prompt,
        answer=answer,
        sources=sources,
        retrieval_count=len(retrieved_rows),
        used_count=len(sources),
    )


def print_sources(sources: list[RagSource]) -> None:
    """打印 Retrieval 阶段最终进入 Prompt 的资料。"""

    print("\n=== Retrieval Result Used By Prompt ===")
    if not sources:
        print("没有资料通过相似度阈值。")
        return

    for source in sources:
        print(f"\n资料 {source.index}")
        print(f"chunk_id   : {source.chunk_id}")
        print(f"document_id: {source.document_id}")
        print(f"source     : {source.source}#page={source.page}")
        print(f"section    : {source.section}")
        print(f"similarity : {source.similarity:.4f}")
        print(f"metadata   : {json.dumps(source.metadata, ensure_ascii=False)}")
        print(f"content    : {source.content}")


def print_rag_response(response: RagResponse, *, show_prompt: bool) -> None:
    """打印 RAG Pipeline 的完整结果。"""

    print("\n=== RAG Pipeline ===")
    print(f"question          : {response.question}")
    print(f"knowledge_base_id : {response.knowledge_base_id}")
    print(f"retrieved_count   : {response.retrieval_count}")
    print(f"used_count        : {response.used_count}")

    print_sources(response.sources)

    if show_prompt:
        print("\n=== Prompt Assemble ===")
        print(response.prompt)

    print("\n=== Generation Result ===")
    print(response.answer)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RAG Pipeline + pgvector 课程实践 demo")
    parser.add_argument(
        "question",
        nargs="?",
        default="我想休年假，应该在哪里提交申请？",
        help="用户问题",
    )
    parser.add_argument(
        "--knowledge-base-id",
        default="kb_hr",
        help="metadata filter：只检索指定知识库",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=3,
        help="Retrieval 返回的候选 Chunk 数量",
    )
    parser.add_argument(
        "--min-similarity",
        type=float,
        default=0.35,
        help="相似度低于该值时，不进入 Prompt",
    )
    parser.add_argument(
        "--show-prompt",
        action="store_true",
        help="打印组装后的 RAG Prompt",
    )
    parser.add_argument(
        "--skip-seed",
        action="store_true",
        help="跳过示例数据写入，只执行问答链路",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    response = run_rag_pipeline(
        question=args.question,
        knowledge_base_id=args.knowledge_base_id,
        top_k=args.top_k,
        min_similarity=args.min_similarity,
        skip_seed=args.skip_seed,
    )
    print_rag_response(response, show_prompt=args.show_prompt)


if __name__ == "__main__":
    main()
