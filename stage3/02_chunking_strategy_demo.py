#!/usr/bin/env python3
"""
02_chunking_strategy_demo.py

Stage 3 demo: Fixed Chunk + Sliding Window Chunk + Semantic Chunk.

对应学习文档：
    docs/stage3/02-文档切块Chunking策略.md

运行：
    python3 stage3/02_chunking_strategy_demo.py

可选：
    python3 stage3/02_chunking_strategy_demo.py --strategy fixed
    python3 stage3/02_chunking_strategy_demo.py --strategy sliding --chunk-size 90 --overlap 30
    python3 stage3/02_chunking_strategy_demo.py --strategy semantic

说明：
    真实 RAG 系统会先解析 PDF、Word、Markdown、网页等文档，再做 Chunking。
    这个 demo 使用一段内置 Markdown 文本，重点学习三件事：

    1. Fixed Chunk 为什么简单但容易切断语义
    2. Sliding Window 如何用 overlap 保留上下文
    3. Semantic Chunk 如何根据标题和段落保留完整主题
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from typing import Literal


Strategy = Literal["fixed", "sliding", "semantic", "all"]


@dataclass(frozen=True)
class RawDocument:
    """原始文档。

    企业 RAG 里通常会先保存 document_id、knowledge_base_id、title、source。
    后面每个 Chunk 都会继承这些信息，这样检索结果才能追溯来源。
    """

    document_id: str
    knowledge_base_id: str
    title: str
    source: str
    text: str


@dataclass(frozen=True)
class TextChunk:
    """切块后的文本片段。

    这里特意保留较多元数据，用于对应文档第 7 节的 Chunk 元数据设计：
    - chunk_id: Chunk 唯一标识
    - document_id / knowledge_base_id: 文档和知识库归属
    - title / section: 文档标题和章节标题
    - chunk_index: 当前文档中的第几个 Chunk
    - start_char / end_char: 在原文中的字符范围，方便定位和排错
    - overlap_chars: 与上一个 Chunk 重叠的字符数，主要用于 Sliding Window
    - content: 真正会送去 Embedding 的文本
    """

    chunk_id: str
    document_id: str
    knowledge_base_id: str
    title: str
    section: str
    chunk_index: int
    start_char: int
    end_char: int
    overlap_chars: int
    content: str


def build_demo_document() -> RawDocument:
    """构造一篇短文档，模拟企业员工手册中的几个章节。

    文本包含 Markdown 标题、段落和列表，方便观察不同切块策略的表现。
    """

    text = """
# 员工手册

## 年假申请流程
员工申请年假前，应先确认自己的剩余年假天数。
员工登录 OA 系统后，选择请假类型为年假，并填写开始日期、结束日期和请假原因。
提交申请后，直属主管会进行审批。审批通过后，年假安排才会正式生效。

## 差旅报销流程
员工完成出差后，需要在费用系统中创建差旅报销单。
报销单需要上传发票、行程单、酒店水单和已批准的出差申请。
如果材料不完整，财务会退回报销单，并要求员工补充资料。

## 会议室预订规则
会议室需要至少提前一天在日程系统中预订。
预订时应选择会议开始时间、结束时间、参会人数和所需设备。
如果会议取消，发起人应及时释放会议室，避免影响其他团队使用。

## 账号安全要求
员工不得把账号密码借给他人使用。
如果发现账号异常登录，应立即修改密码，并联系信息安全团队。
涉及权限变更时，需要提交权限申请流程，由部门负责人审批。
""".strip()

    return RawDocument(
        document_id="doc_employee_handbook",
        knowledge_base_id="kb_hr",
        title="员工手册",
        source="员工手册.md",
        text=text,
    )


def normalize_text(text: str) -> str:
    """把多个空白字符压成一个空格。

    Fixed/Sliding 演示按字符数切分，如果保留大量换行，会让输出不易阅读。
    注意：真实项目是否保留换行，要看模型、文档结构和检索需求。
    """

    return re.sub(r"\s+", " ", text).strip()


def make_chunk(
    document: RawDocument,
    *,
    section: str,
    chunk_index: int,
    start_char: int,
    end_char: int,
    overlap_chars: int,
    content: str,
) -> TextChunk:
    """统一创建 Chunk，避免三种策略的元数据字段不一致。"""

    return TextChunk(
        chunk_id=f"{document.document_id}_chunk_{chunk_index:03d}",
        document_id=document.document_id,
        knowledge_base_id=document.knowledge_base_id,
        title=document.title,
        section=section,
        chunk_index=chunk_index,
        start_char=start_char,
        end_char=end_char,
        overlap_chars=overlap_chars,
        content=content,
    )


def fixed_chunk(
    document: RawDocument,
    chunk_size: int,
) -> list[TextChunk]:
    """固定长度切块。

    优点：实现简单，速度快。
    缺点：不理解标题、段落和句子边界，可能把一个完整流程切断。
    """

    text = normalize_text(document.text)
    chunks: list[TextChunk] = []

    for index, start in enumerate(range(0, len(text), chunk_size), start=1):
        end = min(start + chunk_size, len(text))
        content = text[start:end]
        chunks.append(
            make_chunk(
                document,
                section="fixed-size",
                chunk_index=index,
                start_char=start,
                end_char=end,
                overlap_chars=0,
                content=content,
            )
        )

    return chunks


def sliding_window_chunk(
    document: RawDocument,
    chunk_size: int,
    overlap: int,
) -> list[TextChunk]:
    """滑动窗口切块。

    与 Fixed Chunk 相比，它让相邻 Chunk 之间保留 overlap 个字符。
    这样即使关键信息刚好出现在边界附近，也更可能被下一个 Chunk 带上。
    """

    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size.")

    text = normalize_text(document.text)
    chunks: list[TextChunk] = []
    step = chunk_size - overlap
    start = 0
    index = 1

    while start < len(text):
        end = min(start + chunk_size, len(text))
        content = text[start:end]
        chunks.append(
            make_chunk(
                document,
                section="sliding-window",
                chunk_index=index,
                start_char=start,
                end_char=end,
                overlap_chars=overlap if index > 1 else 0,
                content=content,
            )
        )

        if end == len(text):
            break

        start += step
        index += 1

    return chunks


def parse_markdown_sections(text: str) -> list[tuple[str, int, int, str]]:
    """解析 Markdown 二级标题，返回章节标题和内容范围。

    返回结构：
        (section_title, start_char, end_char, section_text)

    这个函数只处理 demo 里的 Markdown 结构，不是完整 Markdown 解析器。
    真实项目里更推荐使用成熟解析器，或者使用文档解析服务保留标题层级。
    """

    matches = list(re.finditer(r"^##\s+(.+)$", text, flags=re.MULTILINE))
    sections: list[tuple[str, int, int, str]] = []

    for match_index, match in enumerate(matches):
        section_title = match.group(1).strip()
        start = match.start()
        if match_index + 1 < len(matches):
            end = matches[match_index + 1].start()
        else:
            end = len(text)
        section_text = text[start:end].strip()
        sections.append((section_title, start, end, section_text))

    return sections


def split_large_section(
    document: RawDocument,
    *,
    section: str,
    section_start: int,
    section_text: str,
    max_chunk_size: int,
    first_chunk_index: int,
) -> list[TextChunk]:
    """当语义章节太长时，按段落继续拆分。

    Semantic Chunk 不代表一个章节永远只生成一个 Chunk。
    如果某一节非常长，仍然需要继续拆，否则会出现“Chunk 太大”的问题。
    """

    paragraphs = [item.strip() for item in section_text.splitlines() if item.strip()]
    chunks: list[TextChunk] = []
    buffer: list[str] = []
    buffer_start = section_start
    chunk_index = first_chunk_index
    cursor = section_start

    for paragraph in paragraphs:
        paragraph_start = document.text.find(paragraph, cursor)
        if paragraph_start == -1:
            paragraph_start = cursor
        paragraph_end = paragraph_start + len(paragraph)

        candidate = "\n".join([*buffer, paragraph]).strip()
        if buffer and len(candidate) > max_chunk_size:
            content = "\n".join(buffer).strip()
            chunks.append(
                make_chunk(
                    document,
                    section=section,
                    chunk_index=chunk_index,
                    start_char=buffer_start,
                    end_char=cursor,
                    overlap_chars=0,
                    content=content,
                )
            )
            chunk_index += 1
            buffer = [paragraph]
            buffer_start = paragraph_start
        else:
            if not buffer:
                buffer_start = paragraph_start
            buffer.append(paragraph)

        cursor = paragraph_end

    if buffer:
        content = "\n".join(buffer).strip()
        chunks.append(
            make_chunk(
                document,
                section=section,
                chunk_index=chunk_index,
                start_char=buffer_start,
                end_char=cursor,
                overlap_chars=0,
                content=content,
            )
        )

    return chunks


def semantic_chunk(
    document: RawDocument,
    max_chunk_size: int,
) -> list[TextChunk]:
    """语义切块。

    这个 demo 用 Markdown 二级标题作为语义边界。
    每个章节优先整体作为一个 Chunk，如果章节超过 max_chunk_size，
    再按段落拆成多个 Chunk。
    """

    sections = parse_markdown_sections(document.text)
    chunks: list[TextChunk] = []
    next_chunk_index = 1

    for section_title, start, end, section_text in sections:
        if len(section_text) <= max_chunk_size:
            chunks.append(
                make_chunk(
                    document,
                    section=section_title,
                    chunk_index=next_chunk_index,
                    start_char=start,
                    end_char=end,
                    overlap_chars=0,
                    content=section_text,
                )
            )
            next_chunk_index += 1
            continue

        section_chunks = split_large_section(
            document,
            section=section_title,
            section_start=start,
            section_text=section_text,
            max_chunk_size=max_chunk_size,
            first_chunk_index=next_chunk_index,
        )
        chunks.extend(section_chunks)
        next_chunk_index += len(section_chunks)

    return chunks


def print_document(document: RawDocument) -> None:
    """打印原始文档，方便对照切块结果。"""

    print("=== Raw Document ===")
    print(f"document_id       : {document.document_id}")
    print(f"knowledge_base_id : {document.knowledge_base_id}")
    print(f"title             : {document.title}")
    print(f"source            : {document.source}")
    print(f"chars             : {len(document.text)}")
    print("\n--- content ---")
    print(document.text)


def print_chunks(strategy_name: str, chunks: list[TextChunk]) -> None:
    """打印切块结果。"""

    print(f"\n=== {strategy_name} Result | total={len(chunks)} ===")
    for chunk in chunks:
        print(f"\n[{chunk.chunk_id}]")
        print(
            "metadata: "
            f"section={chunk.section}, "
            f"chunk_index={chunk.chunk_index}, "
            f"range={chunk.start_char}:{chunk.end_char}, "
            f"overlap={chunk.overlap_chars}"
        )
        print(f"content_chars={len(chunk.content)}")
        print(chunk.content)


def print_strategy_summary(
    fixed_chunks: list[TextChunk],
    sliding_chunks: list[TextChunk],
    semantic_chunks: list[TextChunk],
) -> None:
    """用简单指标对比三种策略。"""

    print("\n=== Strategy Summary ===")
    print("Fixed Chunk:")
    print(f"- chunk_count={len(fixed_chunks)}")
    print("- 特点：最快，但可能把标题、句子或流程步骤切断。")

    print("\nSliding Window Chunk:")
    print(f"- chunk_count={len(sliding_chunks)}")
    print("- 特点：通过 overlap 保留边界上下文，但存储和 Embedding 成本更高。")

    print("\nSemantic Chunk:")
    print(f"- chunk_count={len(semantic_chunks)}")
    print("- 特点：按章节保留完整主题，检索和引用通常更清晰。")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="文档切块 Chunking 策略教学 demo")
    parser.add_argument(
        "--strategy",
        choices=["fixed", "sliding", "semantic", "all"],
        default="all",
        help="选择要演示的切块策略",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=120,
        help="Fixed/Sliding 的固定字符数，或 Semantic 的最大 Chunk 长度",
    )
    parser.add_argument(
        "--overlap",
        type=int,
        default=40,
        help="Sliding Window 的重叠字符数",
    )
    parser.add_argument(
        "--show-document",
        action="store_true",
        help="是否打印完整原始文档",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    document = build_demo_document()

    if args.show_document:
        print_document(document)

    if args.strategy in {"fixed", "all"}:
        fixed_chunks = fixed_chunk(document, chunk_size=args.chunk_size)
        print_chunks("Fixed Chunk", fixed_chunks)
    else:
        fixed_chunks = []

    if args.strategy in {"sliding", "all"}:
        sliding_chunks = sliding_window_chunk(
            document,
            chunk_size=args.chunk_size,
            overlap=args.overlap,
        )
        print_chunks("Sliding Window Chunk", sliding_chunks)
    else:
        sliding_chunks = []

    if args.strategy in {"semantic", "all"}:
        semantic_chunks = semantic_chunk(document, max_chunk_size=args.chunk_size)
        print_chunks("Semantic Chunk", semantic_chunks)
    else:
        semantic_chunks = []

    if args.strategy == "all":
        print_strategy_summary(fixed_chunks, sliding_chunks, semantic_chunks)


if __name__ == "__main__":
    main()
