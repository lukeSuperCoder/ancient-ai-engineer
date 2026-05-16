#!/usr/bin/env python3
"""
05_search_classic_literature.py

对已经入库的《三国演义》知识库执行 Top K 向量检索。

运行：
    python3 stage3/05_search_classic_literature.py "刘备关羽张飞在哪里结义？"
"""

from __future__ import annotations

import argparse
import json
from typing import Any

import psycopg2
import requests
from psycopg2.extensions import connection as PgConnection


DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "luke",
    "password": "luke123",
    "dbname": "vector_db",
}

EMBEDDING_URL = "http://127.0.0.1:11434/v1/embeddings"
EMBEDDING_MODEL = "qwen3-embedding:0.6b"
WORK_ID = "classic_sanguo_yanyi"


def connect_db() -> PgConnection:
    return psycopg2.connect(**DB_CONFIG)


def embed_query(query: str) -> list[float]:
    response = requests.post(
        EMBEDDING_URL,
        json={"model": EMBEDDING_MODEL, "input": query},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["data"][0]["embedding"]


def vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"


def search(conn: PgConnection, *, query: str, top_k: int) -> list[dict[str, Any]]:
    query_vector = vector_literal(embed_query(query))
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              chunk_id,
              chapter_number,
              chapter_title,
              chunk_index,
              content,
              source_path,
              metadata,
              embedding <=> %s::vector as distance,
              1 - (embedding <=> %s::vector) as similarity
            from stage3_classic_chunks
            where work_id = %s
            order by embedding <=> %s::vector
            limit %s
            """,
            (query_vector, query_vector, WORK_ID, query_vector, top_k),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检索《三国演义》pgvector 知识库")
    parser.add_argument("query", nargs="?", default="刘备关羽张飞在哪里结义？")
    parser.add_argument("--top-k", type=int, default=5)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with connect_db() as conn:
        results = search(conn, query=args.query, top_k=args.top_k)

    print("\n=== Classic Literature Vector Search ===")
    print(f"query : {args.query}")
    print(f"top_k : {args.top_k}")

    for index, row in enumerate(results, start=1):
        preview = row["content"].replace("\n", " ")[:220]
        print(f"\nTop {index}")
        print(f"chunk_id   : {row['chunk_id']}")
        print(f"chapter    : 第{row['chapter_number']}回 {row['chapter_title']}")
        print(f"chunk_index: {row['chunk_index']}")
        print(f"similarity : {row['similarity']:.4f}")
        print(f"distance   : {row['distance']:.4f}")
        print(f"metadata   : {json.dumps(row['metadata'], ensure_ascii=False)}")
        print(f"content    : {preview}")


if __name__ == "__main__":
    main()
