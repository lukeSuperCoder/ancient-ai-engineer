#!/usr/bin/env python3
"""
05_ingest_three_kingdoms_embeddings.py

把《三国演义》章节 txt 文件切块、调用本地 Embedding 模型、写入 PostgreSQL + pgvector。

前置步骤：
    psql -h localhost -p 5432 -U luke -d vector_db -f stage3/05_classic_literature_schema.sql

运行：
    python3 stage3/05_ingest_three_kingdoms_embeddings.py

建议先小批量试跑：
    python3 stage3/05_ingest_three_kingdoms_embeddings.py --limit-chapters 2 --dry-run
    python3 stage3/05_ingest_three_kingdoms_embeddings.py --limit-chapters 2

默认配置：
    - 文本目录：/Users/luke/Desktop/project/AI-space/Romance-of-the-Three-Kingdoms/src
    - Embedding endpoint：http://127.0.0.1:11434/v1/embeddings
    - Embedding model：qwen3-embedding:0.6b
    - 向量维度：1024

说明：
    本脚本保留了较多注释，便于学习“文本 -> Chunk -> Embedding -> pgvector 入库”的完整链路。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
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

DEFAULT_SOURCE_DIR = Path(
    "/Users/luke/Desktop/project/AI-space/Romance-of-the-Three-Kingdoms/src"
)
DEFAULT_EMBEDDING_URL = "http://127.0.0.1:11434/v1/embeddings"
DEFAULT_EMBEDDING_MODEL = "qwen3-embedding:0.6b"
EXPECTED_EMBEDDING_DIM = 1024

WORK_ID = "classic_sanguo_yanyi"
WORK_TITLE = "三国演义"
WORK_AUTHOR = "罗贯中"
WORK_DYNASTY = "元末明初"


@dataclass(frozen=True)
class ChapterFile:
    """一个章节 txt 文件对应数据库中的一条 chapter 记录。"""

    chapter_number: int
    chapter_title: str
    filename: str
    path: Path
    text: str

    @property
    def chapter_id(self) -> str:
        return f"{WORK_ID}_ch{self.chapter_number:03d}"


@dataclass(frozen=True)
class TextChunk:
    """准备入库的文本块。

    start_char / end_char 保存原文偏移，后续如果要在原文中高亮引用位置会很有用。
    """

    chunk_id: str
    chapter: ChapterFile
    chunk_index: int
    content: str
    start_char: int
    end_char: int

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.content.encode("utf-8")).hexdigest()

    @property
    def token_estimate(self) -> int:
        # 中文场景下这里不追求精确 tokenizer，只做粗略容量估计。
        # 真实生产环境可替换为模型对应 tokenizer。
        return max(1, len(self.content) // 2)


def connect_db() -> PgConnection:
    return psycopg2.connect(**DB_CONFIG)


def normalize_text(text: str) -> str:
    """清理 txt 中常见的全角空格和过多空行，同时尽量保留原文段落边界。"""

    text = text.replace("\ufeff", "")
    text = text.replace("\u3000", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chapter_sort_key(path: Path) -> int:
    match = re.match(r"\s*(\d+)\.", path.name)
    if not match:
        raise ValueError(f"章节文件名缺少数字前缀：{path}")
    return int(match.group(1))


def parse_chapter_title(text: str, fallback_name: str) -> str:
    """优先使用正文第一行作为回目标题，失败时退回文件名标题。"""

    for line in text.splitlines():
        line = line.strip()
        if line:
            return re.sub(r"^正文\s*", "", line)
    return Path(fallback_name).stem


def load_chapters(source_dir: Path, limit_chapters: int | None) -> list[ChapterFile]:
    if not source_dir.exists():
        raise FileNotFoundError(f"找不到文本目录：{source_dir}")

    paths = sorted(source_dir.glob("*.txt"), key=chapter_sort_key)
    if limit_chapters is not None:
        paths = paths[:limit_chapters]

    chapters: list[ChapterFile] = []
    for path in paths:
        raw_text = path.read_text(encoding="utf-8")
        text = normalize_text(raw_text)
        chapter_number = chapter_sort_key(path)
        chapters.append(
            ChapterFile(
                chapter_number=chapter_number,
                chapter_title=parse_chapter_title(text, path.name),
                filename=path.name,
                path=path,
                text=text,
            )
        )
    return chapters


def split_long_paragraph(paragraph: str, max_chars: int) -> list[str]:
    """把过长段落按中文标点尽量自然地切开。"""

    if len(paragraph) <= max_chars:
        return [paragraph]

    sentences = re.split(r"(?<=[。！？；])", paragraph)
    parts: list[str] = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        if len(sentence) > max_chars:
            if current:
                parts.append(current)
                current = ""
            parts.extend(
                sentence[index : index + max_chars]
                for index in range(0, len(sentence), max_chars)
            )
            continue

        if current and len(current) + len(sentence) > max_chars:
            parts.append(current)
            current = sentence
        else:
            current += sentence

    if current:
        parts.append(current)
    return parts


def build_chunks(
    chapter: ChapterFile,
    *,
    max_chars: int,
    overlap_chars: int,
) -> list[TextChunk]:
    """按段落聚合切块，并给相邻 chunk 留少量重叠上下文。

    这里用字符数做教学版切块策略，原因是《三国演义》是中文长文本，
    先把“语义段落边界 + 固定长度上限”跑通，比一开始引入复杂 tokenizer 更直观。
    """

    paragraphs: list[str] = []
    for paragraph in re.split(r"\n\s*\n", chapter.text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        paragraphs.extend(split_long_paragraph(paragraph, max_chars=max_chars))

    chunks: list[TextChunk] = []
    current = ""
    search_from = 0

    def flush() -> None:
        nonlocal current, search_from
        content = current.strip()
        if not content:
            return

        start_char = chapter.text.find(content[: min(30, len(content))], search_from)
        if start_char < 0:
            start_char = search_from
        end_char = min(len(chapter.text), start_char + len(content))
        search_from = end_char

        chunk_index = len(chunks) + 1
        chunks.append(
            TextChunk(
                chunk_id=f"{WORK_ID}_ch{chapter.chapter_number:03d}_{chunk_index:04d}",
                chapter=chapter,
                chunk_index=chunk_index,
                content=content,
                start_char=start_char,
                end_char=end_char,
            )
        )
        current = content[-overlap_chars:] if overlap_chars > 0 else ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) > max_chars and current:
            flush()
            candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
            if len(candidate) > max_chars:
                # overlap 只是辅助上下文，不应该让 chunk 长度超过 max_chars。
                # 如果“上一段尾巴 + 当前段落”仍然太长，就丢弃这次 overlap。
                candidate = paragraph
        current = candidate

    flush()
    return chunks


class OllamaEmbeddingClient:
    """调用 Ollama 的 OpenAI-compatible /v1/embeddings 接口。"""

    def __init__(self, *, url: str, model: str, timeout: int, sleep_seconds: float) -> None:
        self.url = url
        self.model = model
        self.timeout = timeout
        self.sleep_seconds = sleep_seconds

    def embed(self, text: str) -> list[float]:
        response = requests.post(
            self.url,
            json={"model": self.model, "input": text},
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        embedding = payload["data"][0]["embedding"]

        if len(embedding) != EXPECTED_EMBEDDING_DIM:
            raise ValueError(
                f"Embedding 维度不匹配：期望 {EXPECTED_EMBEDDING_DIM}，实际 {len(embedding)}"
            )

        if self.sleep_seconds > 0:
            time.sleep(self.sleep_seconds)
        return embedding


def vector_literal(vector: list[float]) -> str:
    """把 Python list 转成 pgvector 可识别的字符串。"""

    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"


def seed_work_and_chapters(conn: PgConnection, chapters: list[ChapterFile], source_dir: Path) -> None:
    """写入作品和章节元数据。"""

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into stage3_classic_works (
              id, title, author, dynasty, language, description, source_dir, metadata, updated_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, now())
            on conflict (id) do update set
              title = excluded.title,
              author = excluded.author,
              dynasty = excluded.dynasty,
              language = excluded.language,
              description = excluded.description,
              source_dir = excluded.source_dir,
              metadata = excluded.metadata,
              updated_at = now()
            """,
            (
                WORK_ID,
                WORK_TITLE,
                WORK_AUTHOR,
                WORK_DYNASTY,
                "zh",
                "中国古典长篇章回体历史演义小说，本实践用于 RAG/向量检索学习。",
                str(source_dir),
                json.dumps(
                    {
                        "category": "classic_literature",
                        "country": "China",
                        "source_format": "chapter_txt_files",
                    },
                    ensure_ascii=False,
                ),
            ),
        )

        for chapter in chapters:
            cur.execute(
                """
                insert into stage3_classic_chapters (
                  id, work_id, chapter_number, chapter_title, filename,
                  source_path, char_count, metadata, updated_at
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, now())
                on conflict (id) do update set
                  chapter_number = excluded.chapter_number,
                  chapter_title = excluded.chapter_title,
                  filename = excluded.filename,
                  source_path = excluded.source_path,
                  char_count = excluded.char_count,
                  metadata = excluded.metadata,
                  updated_at = now()
                """,
                (
                    chapter.chapter_id,
                    WORK_ID,
                    chapter.chapter_number,
                    chapter.chapter_title,
                    chapter.filename,
                    str(chapter.path),
                    len(chapter.text),
                    json.dumps(
                        {
                            "chapter_number": chapter.chapter_number,
                            "chapter_title": chapter.chapter_title,
                        },
                        ensure_ascii=False,
                    ),
                ),
            )
    conn.commit()


def upsert_chunk(conn: PgConnection, chunk: TextChunk, embedding: list[float]) -> None:
    """写入一个 chunk 及其向量。使用 upsert 支持重复执行脚本。"""

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into stage3_classic_chunks (
              chunk_id,
              work_id,
              chapter_id,
              chapter_number,
              chapter_title,
              chunk_index,
              content,
              content_hash,
              start_char,
              end_char,
              token_estimate,
              source_path,
              metadata,
              embedding,
              updated_at
            )
            values (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::vector, now()
            )
            on conflict (chunk_id) do update set
              chapter_title = excluded.chapter_title,
              chunk_index = excluded.chunk_index,
              content = excluded.content,
              content_hash = excluded.content_hash,
              start_char = excluded.start_char,
              end_char = excluded.end_char,
              token_estimate = excluded.token_estimate,
              source_path = excluded.source_path,
              metadata = excluded.metadata,
              embedding = excluded.embedding,
              updated_at = now()
            """,
            (
                chunk.chunk_id,
                WORK_ID,
                chunk.chapter.chapter_id,
                chunk.chapter.chapter_number,
                chunk.chapter.chapter_title,
                chunk.chunk_index,
                chunk.content,
                chunk.content_hash,
                chunk.start_char,
                chunk.end_char,
                chunk.token_estimate,
                str(chunk.chapter.path),
                json.dumps(
                    {
                        "work_title": WORK_TITLE,
                        "author": WORK_AUTHOR,
                        "chapter_number": chunk.chapter.chapter_number,
                        "chapter_title": chunk.chapter.chapter_title,
                    },
                    ensure_ascii=False,
                ),
                vector_literal(embedding),
            ),
        )
    conn.commit()


def print_database_overview(conn: PgConnection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              w.id,
              w.title,
              count(distinct c.id) as chapter_count,
              count(distinct k.id) as chunk_count
            from stage3_classic_works w
            left join stage3_classic_chapters c on c.work_id = w.id
            left join stage3_classic_chunks k on k.work_id = w.id
            where w.id = %s
            group by w.id, w.title
            """,
            (WORK_ID,),
        )
        row = cur.fetchone()

    if row:
        work_id, title, chapter_count, chunk_count = row
        print("\n=== Database Overview ===")
        print(f"work_id  : {work_id}")
        print(f"title    : {title}")
        print(f"chapters : {chapter_count}")
        print(f"chunks   : {chunk_count}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="《三国演义》本地 Embedding 入库脚本")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--embedding-url", default=DEFAULT_EMBEDDING_URL)
    parser.add_argument("--embedding-model", default=DEFAULT_EMBEDDING_MODEL)
    parser.add_argument("--max-chars", type=int, default=900, help="每个 chunk 的最大字符数")
    parser.add_argument("--overlap-chars", type=int, default=120, help="相邻 chunk 的重叠字符数")
    parser.add_argument("--limit-chapters", type=int, help="只处理前 N 回，便于试跑")
    parser.add_argument("--timeout", type=int, default=60, help="Embedding 请求超时时间")
    parser.add_argument("--sleep-seconds", type=float, default=0.0, help="每次 embedding 后暂停")
    parser.add_argument("--dry-run", action="store_true", help="只解析和切块，不写数据库、不请求 embedding")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    chapters = load_chapters(args.source_dir, args.limit_chapters)
    all_chunks = [
        chunk
        for chapter in chapters
        for chunk in build_chunks(
            chapter,
            max_chars=args.max_chars,
            overlap_chars=args.overlap_chars,
        )
    ]

    print("=== Three Kingdoms Ingest Plan ===")
    print(f"source_dir      : {args.source_dir}")
    print(f"chapters        : {len(chapters)}")
    print(f"chunks          : {len(all_chunks)}")
    print(f"max_chars       : {args.max_chars}")
    print(f"overlap_chars   : {args.overlap_chars}")
    print(f"embedding_model : {args.embedding_model}")
    print(f"embedding_dim   : {EXPECTED_EMBEDDING_DIM}")

    if args.dry_run:
        print("\nDry run only. 前 5 个 chunk 预览：")
        for chunk in all_chunks[:5]:
            preview = chunk.content.replace("\n", " ")[:90]
            print(
                f"- {chunk.chunk_id} | 第{chunk.chapter.chapter_number}回 | "
                f"chars={len(chunk.content)} | {preview}"
            )
        return

    client = OllamaEmbeddingClient(
        url=args.embedding_url,
        model=args.embedding_model,
        timeout=args.timeout,
        sleep_seconds=args.sleep_seconds,
    )

    with connect_db() as conn:
        seed_work_and_chapters(conn, chapters, args.source_dir)

        for index, chunk in enumerate(all_chunks, start=1):
            embedding = client.embed(chunk.content)
            upsert_chunk(conn, chunk, embedding)
            print(
                f"[{index}/{len(all_chunks)}] upsert {chunk.chunk_id} "
                f"chapter={chunk.chapter.chapter_number} chars={len(chunk.content)}"
            )

        print_database_overview(conn)


if __name__ == "__main__":
    main()
