#!/usr/bin/env python3
"""
03_pgvector_practice_demo.py

Stage 3 demo: PostgreSQL + pgvector + metadata filter + Top K retrieval.

对应学习文档：
    docs/stage3/03-向量数据库与索引原理.md

前置步骤：
    psql -h localhost -p 5432 -U luke -d vector_db -f stage3/03_pgvector_schema.sql

运行：
    python3 stage3/03_pgvector_practice_demo.py

可选：
    python3 stage3/03_pgvector_practice_demo.py "我想休年假，怎么提交？"
    python3 stage3/03_pgvector_practice_demo.py "服务器报警怎么办？" --knowledge-base-id kb_it

说明：
    这个 demo 继续沿用 01_embedding_similarity_demo.py 里的 ToyEmbeddingModel。
    它不是生产级 Embedding 模型，只用于教学。

    本脚本重点不是模型能力，而是把“向量数据库实践链路”跑通：

    1. 连接本地 PostgreSQL vector_db
    2. 写入 knowledge_bases / documents / document_chunks
    3. 保存 content、metadata、embedding
    4. 使用 knowledge_base_id 做 metadata filter
    5. 使用 pgvector 的 cosine distance 执行 Top K 检索
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Any

import psycopg2
from psycopg2.extensions import connection as PgConnection


DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "luke",
    "password": "luke123",
    "dbname": "vector_db",
}


@dataclass(frozen=True)
class DemoChunk:
    """准备写入 pgvector 的课程示例 Chunk。"""

    chunk_id: str
    document_id: str
    knowledge_base_id: str
    content: str
    source: str
    page: int
    section: str
    chunk_index: int
    metadata: dict[str, Any]


class ToyEmbeddingModel:
    """教学用 Embedding 模型。

    SQL 表里使用 embedding vector(7)，所以这里也输出 7 维向量。
    真实项目必须让数据库 vector(n) 的 n 与模型输出维度保持一致。
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
        vector: list[float] = []
        for _dimension_name, keywords in self.dimensions:
            score = 0.0
            for keyword in keywords:
                if keyword in text:
                    score += 1.0 + len(keyword) * 0.1
            vector.append(score)
        return vector


def vector_literal(vector: list[float]) -> str:
    """把 Python list 转成 pgvector 可识别的字符串。

    pgvector 接收类似 '[1.0,0.0,2.0]' 的文本表示。
    插入和查询时再通过 %s::vector 显式转换。
    """

    return "[" + ",".join(f"{value:.6f}" for value in vector) + "]"


def connect_db() -> PgConnection:
    """连接用户本机 PostgreSQL。"""

    return psycopg2.connect(**DB_CONFIG)


def build_demo_chunks() -> list[DemoChunk]:
    """构造两套知识库数据，用来演示 metadata filter。

    - kb_hr: HR 员工制度
    - kb_it: IT 运维与安全

    检索时如果指定 knowledge_base_id='kb_hr'，就不会返回 IT 的服务器内容。
    """

    return [
        DemoChunk(
            chunk_id="hr_leave_001",
            document_id="doc_hr_handbook",
            knowledge_base_id="kb_hr",
            content="员工年假申请需要在 OA 系统提交，直属主管审批通过后生效。",
            source="员工手册.md",
            page=3,
            section="年假申请流程",
            chunk_index=1,
            metadata={"department": "hr", "doc_type": "policy", "year": 2026},
        ),
        DemoChunk(
            chunk_id="hr_leave_002",
            document_id="doc_hr_handbook",
            knowledge_base_id="kb_hr",
            content="员工请假超过三天时，除直属主管审批外，还需要部门负责人审批。",
            source="员工手册.md",
            page=4,
            section="年假申请流程",
            chunk_index=2,
            metadata={"department": "hr", "doc_type": "policy", "year": 2026},
        ),
        DemoChunk(
            chunk_id="hr_leave_003",
            document_id="doc_hr_handbook",
            knowledge_base_id="kb_hr",
            content="年假余额可以在员工自助系统中查询，系统会显示已使用天数和剩余天数。",
            source="员工手册.md",
            page=4,
            section="年假余额查询",
            chunk_index=3,
            metadata={"department": "hr", "doc_type": "policy", "year": 2026},
        ),
        DemoChunk(
            chunk_id="hr_reimbursement_001",
            document_id="doc_hr_finance_policy",
            knowledge_base_id="kb_hr",
            content="差旅报销需要上传发票、行程单和审批单，财务会在三个工作日内处理。",
            source="财务制度.md",
            page=5,
            section="差旅报销流程",
            chunk_index=1,
            metadata={"department": "finance", "doc_type": "policy", "year": 2026},
        ),
        DemoChunk(
            chunk_id="hr_reimbursement_002",
            document_id="doc_hr_finance_policy",
            knowledge_base_id="kb_hr",
            content="报销材料不完整时，财务会退回报销单，员工需要补充材料后重新提交。",
            source="财务制度.md",
            page=6,
            section="差旅报销流程",
            chunk_index=2,
            metadata={"department": "finance", "doc_type": "policy", "year": 2026},
        ),
        DemoChunk(
            chunk_id="hr_meeting_001",
            document_id="doc_hr_admin_policy",
            knowledge_base_id="kb_hr",
            content="会议室预订需要在日程系统中选择时间段，并确认投影设备是否可用。",
            source="行政服务手册.md",
            page=6,
            section="会议室预订规则",
            chunk_index=1,
            metadata={"department": "admin", "doc_type": "guide", "year": 2026},
        ),
        DemoChunk(
            chunk_id="hr_onboarding_001",
            document_id="doc_hr_handbook",
            knowledge_base_id="kb_hr",
            content="新人入职当天会领取工牌、电脑和企业邮箱账号，部门助理会协助完成系统登录。",
            source="员工手册.md",
            page=2,
            section="新人入职流程",
            chunk_index=4,
            metadata={"department": "hr", "doc_type": "guide", "year": 2026},
        ),
        DemoChunk(
            chunk_id="it_ops_001",
            document_id="doc_it_ops_manual",
            knowledge_base_id="kb_it",
            content="服务器 CPU 使用率持续过高时，应先查看报警详情并联系运维团队。",
            source="运维值班手册.md",
            page=8,
            section="服务器报警处理",
            chunk_index=1,
            metadata={"department": "it", "doc_type": "runbook", "year": 2026},
        ),
        DemoChunk(
            chunk_id="it_ops_002",
            document_id="doc_it_ops_manual",
            knowledge_base_id="kb_it",
            content="服务器内存报警时，应先确认是否存在异常进程，再根据值班手册执行扩容或重启流程。",
            source="运维值班手册.md",
            page=9,
            section="服务器报警处理",
            chunk_index=2,
            metadata={"department": "it", "doc_type": "runbook", "year": 2026},
        ),
        DemoChunk(
            chunk_id="it_security_001",
            document_id="doc_it_security_guide",
            knowledge_base_id="kb_it",
            content="忘记登录密码时，可以在账号安全中心发起密码重置流程。",
            source="信息安全指南.md",
            page=2,
            section="账号安全",
            chunk_index=1,
            metadata={"department": "it", "doc_type": "guide", "year": 2026},
        ),
        DemoChunk(
            chunk_id="it_security_002",
            document_id="doc_it_security_guide",
            knowledge_base_id="kb_it",
            content="涉及系统权限变更时，需要提交权限申请流程，并由部门负责人审批。",
            source="信息安全指南.md",
            page=3,
            section="权限变更",
            chunk_index=2,
            metadata={"department": "it", "doc_type": "guide", "year": 2026},
        ),
    ]


def seed_demo_data(conn: PgConnection, embedding_model: ToyEmbeddingModel) -> None:
    """写入知识库、文档、Chunk 和向量。

    使用 on conflict 是为了让脚本可以重复运行。
    这对课程 demo 很重要：你可以多次执行，不需要每次手动清表。
    """

    chunks = build_demo_chunks()

    knowledge_bases = [
        ("kb_hr", "HR 知识库", "员工制度、行政、财务流程", "user_luke"),
        ("kb_it", "IT 知识库", "运维、安全和账号问题", "user_luke"),
    ]

    documents = [
        ("doc_hr_handbook", "kb_hr", "员工手册.md", "markdown", "ready", "user_luke"),
        ("doc_hr_finance_policy", "kb_hr", "财务制度.md", "markdown", "ready", "user_luke"),
        ("doc_hr_admin_policy", "kb_hr", "行政服务手册.md", "markdown", "ready", "user_luke"),
        ("doc_it_ops_manual", "kb_it", "运维值班手册.md", "markdown", "ready", "user_luke"),
        ("doc_it_security_guide", "kb_it", "信息安全指南.md", "markdown", "ready", "user_luke"),
    ]

    with conn.cursor() as cur:
        cur.executemany(
            """
            insert into stage3_knowledge_bases (id, name, description, owner_id)
            values (%s, %s, %s, %s)
            on conflict (id) do update set
              name = excluded.name,
              description = excluded.description,
              owner_id = excluded.owner_id
            """,
            knowledge_bases,
        )

        cur.executemany(
            """
            insert into stage3_documents (
              id, knowledge_base_id, filename, file_type, status, uploaded_by
            )
            values (%s, %s, %s, %s, %s, %s)
            on conflict (id) do update set
              knowledge_base_id = excluded.knowledge_base_id,
              filename = excluded.filename,
              file_type = excluded.file_type,
              status = excluded.status,
              uploaded_by = excluded.uploaded_by
            """,
            documents,
        )

        for chunk in chunks:
            embedding = embedding_model.embed(chunk.content)
            cur.execute(
                """
                insert into stage3_document_chunks (
                  chunk_id,
                  document_id,
                  knowledge_base_id,
                  content,
                  source,
                  page,
                  section,
                  chunk_index,
                  metadata,
                  embedding
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::vector)
                on conflict (chunk_id) do update set
                  document_id = excluded.document_id,
                  knowledge_base_id = excluded.knowledge_base_id,
                  content = excluded.content,
                  source = excluded.source,
                  page = excluded.page,
                  section = excluded.section,
                  chunk_index = excluded.chunk_index,
                  metadata = excluded.metadata,
                  embedding = excluded.embedding
                """,
                (
                    chunk.chunk_id,
                    chunk.document_id,
                    chunk.knowledge_base_id,
                    chunk.content,
                    chunk.source,
                    chunk.page,
                    chunk.section,
                    chunk.chunk_index,
                    json.dumps(chunk.metadata, ensure_ascii=False),
                    vector_literal(embedding),
                ),
            )

    conn.commit()


def search_similar_chunks(
    conn: PgConnection,
    *,
    query: str,
    knowledge_base_id: str,
    top_k: int,
    embedding_model: ToyEmbeddingModel,
) -> list[dict[str, Any]]:
    """执行带 knowledge_base_id 过滤的 Top K 向量检索。

    SQL 重点：
    - where knowledge_base_id = %s 是 metadata filter 的最小形式
    - embedding <=> %s::vector 是 cosine distance
    - distance 越小越相似，所以 order by distance asc
    - similarity = 1 - distance 只是为了输出更直观
    """

    query_embedding = vector_literal(embedding_model.embed(query))

    with conn.cursor() as cur:
        cur.execute(
            """
            select
              chunk_id,
              document_id,
              knowledge_base_id,
              content,
              source,
              page,
              section,
              metadata,
              embedding <=> %s::vector as distance,
              1 - (embedding <=> %s::vector) as similarity
            from stage3_document_chunks
            where knowledge_base_id = %s
            order by embedding <=> %s::vector
            limit %s
            """,
            (
                query_embedding,
                query_embedding,
                knowledge_base_id,
                query_embedding,
                top_k,
            ),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def print_database_overview(conn: PgConnection) -> None:
    """打印表内数据概览，确认示例数据已经入库。"""

    with conn.cursor() as cur:
        cur.execute(
            """
            select
              kb.id,
              kb.name,
              count(distinct d.id) as document_count,
              count(distinct c.id) as chunk_count
            from stage3_knowledge_bases kb
            left join stage3_documents d on d.knowledge_base_id = kb.id
            left join stage3_document_chunks c on c.knowledge_base_id = kb.id
            group by kb.id, kb.name
            order by kb.id
            """
        )
        rows = cur.fetchall()

    print("\n=== Database Overview ===")
    for kb_id, name, document_count, chunk_count in rows:
        print(
            f"- {kb_id} | {name} | "
            f"documents={document_count} | chunks={chunk_count}"
        )


def print_search_results(
    *,
    query: str,
    knowledge_base_id: str,
    top_k: int,
    results: list[dict[str, Any]],
) -> None:
    """打印检索结果，模拟 RAG 后续会拿到的上下文片段。"""

    print("\n=== Vector Search ===")
    print(f"query             : {query}")
    print(f"knowledge_base_id : {knowledge_base_id}")
    print(f"top_k             : {top_k}")

    print("\n=== Top K Results ===")
    for index, row in enumerate(results, start=1):
        print(f"\nTop {index}")
        print(f"chunk_id   : {row['chunk_id']}")
        print(f"document_id: {row['document_id']}")
        print(f"section    : {row['section']}")
        print(f"source     : {row['source']}#page={row['page']}")
        print(f"distance   : {row['distance']:.4f}")
        print(f"similarity : {row['similarity']:.4f}")
        print(f"metadata   : {json.dumps(row['metadata'], ensure_ascii=False)}")
        print(f"content    : {row['content']}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="PostgreSQL + pgvector 课程实践 demo")
    parser.add_argument(
        "query",
        nargs="?",
        default="我想休年假，应该在哪里提交申请？",
        help="要检索的用户问题",
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
        help="返回最相似的前几个 Chunk",
    )
    parser.add_argument(
        "--skip-seed",
        action="store_true",
        help="跳过示例数据写入，只执行检索",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    embedding_model = ToyEmbeddingModel()

    with connect_db() as conn:
        if not args.skip_seed:
            seed_demo_data(conn, embedding_model)

        print_database_overview(conn)
        results = search_similar_chunks(
            conn,
            query=args.query,
            knowledge_base_id=args.knowledge_base_id,
            top_k=args.top_k,
            embedding_model=embedding_model,
        )
        print_search_results(
            query=args.query,
            knowledge_base_id=args.knowledge_base_id,
            top_k=args.top_k,
            results=results,
        )


if __name__ == "__main__":
    main()
