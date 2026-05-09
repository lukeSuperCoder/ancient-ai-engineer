#!/usr/bin/env python3
"""
02-structured-output.py

Stage 2 example: Structured Output + Schema Validation + Output Parser.

This demo asks the model to classify a customer support ticket and return
strict JSON. The application then parses and validates that JSON before using
it as business data.

Run:
    python3 stage2/02-structured-output.py

Environment:
    MODEL_ID=...
    ANTHROPIC_API_KEY=...

Optional:
    ANTHROPIC_BASE_URL=...
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic
from dotenv import load_dotenv


logging.basicConfig(
    level=logging.INFO,
    format="\033[33m[%(asctime)s %(levelname)s]\033[0m %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("stage2-structured-output")

load_dotenv(override=True)

if os.getenv("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)

MODEL = os.getenv("MODEL_ID")
if not MODEL:
    raise RuntimeError("Missing MODEL_ID. Set it in .env or your shell.")

client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))


SYSTEM = """
You are a structured-output classifier.

Return exactly one JSON object. Do not include Markdown fences, comments,
explanations, or extra text.

Schema:
{
  "category": "refund | delivery | account | other",
  "priority": "low | medium | high",
  "summary": "string, 1-80 Chinese characters",
  "confidence": "number from 0 to 1",
  "reason": "string, brief Chinese explanation"
}

Rules:
- category must be one of: refund, delivery, account, other.
- priority must be one of: low, medium, high.
- confidence must be a number between 0 and 1.
- Use English stable identifiers for category and priority.
- summary and reason should be Chinese.
""".strip()


CATEGORY_VALUES = {"refund", "delivery", "account", "other"}
PRIORITY_VALUES = {"low", "medium", "high"}


@dataclass(frozen=True)
class TicketClassification:
    category: str
    priority: str
    summary: str
    confidence: float
    reason: str


@dataclass(frozen=True)
class ParseResult:
    ok: bool
    data: TicketClassification | None = None
    error: str | None = None
    raw: str = ""


def extract_json_object(text: str) -> str:
    """Extract a JSON object from model text.

    The prompt asks for raw JSON, but demos should still be defensive because
    model output is external input.
    """
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        return text

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]

    raise ValueError("No JSON object found in model output.")


def require_string(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")
    if not value.strip():
        raise ValueError(f"{field} cannot be empty.")
    return value.strip()


def validate_ticket_classification(value: Any) -> TicketClassification:
    if not isinstance(value, dict):
        raise ValueError("Output must be a JSON object.")

    required = {"category", "priority", "summary", "confidence", "reason"}
    missing = required - set(value)
    if missing:
        raise ValueError(f"Missing required field(s): {sorted(missing)}")

    extra = set(value) - required
    if extra:
        raise ValueError(f"Unexpected field(s): {sorted(extra)}")

    category = require_string(value["category"], "category")
    if category not in CATEGORY_VALUES:
        raise ValueError(f"category must be one of {sorted(CATEGORY_VALUES)}.")

    priority = require_string(value["priority"], "priority")
    if priority not in PRIORITY_VALUES:
        raise ValueError(f"priority must be one of {sorted(PRIORITY_VALUES)}.")

    summary = require_string(value["summary"], "summary")
    if len(summary) > 80:
        raise ValueError("summary must be 80 characters or fewer.")

    confidence = value["confidence"]
    if not isinstance(confidence, (int, float)):
        raise ValueError("confidence must be a number.")
    confidence = float(confidence)
    if confidence < 0 or confidence > 1:
        raise ValueError("confidence must be between 0 and 1.")

    reason = require_string(value["reason"], "reason")

    return TicketClassification(
        category=category,
        priority=priority,
        summary=summary,
        confidence=confidence,
        reason=reason,
    )


def parse_structured_output(raw_text: str) -> ParseResult:
    try:
        json_text = extract_json_object(raw_text)
        parsed = json.loads(json_text)
        data = validate_ticket_classification(parsed)
        return ParseResult(ok=True, data=data, raw=raw_text)
    except Exception as exc:
        return ParseResult(ok=False, error=str(exc), raw=raw_text)


def call_model(ticket_text: str, correction_error: str | None = None) -> str:
    if correction_error:
        user_content = f"""
Your previous output failed validation:
{correction_error}

Classify this customer support ticket again.
Return only one valid JSON object that matches the schema.

Ticket:
{ticket_text}
""".strip()
    else:
        user_content = f"""
Classify this customer support ticket.
Return only one valid JSON object.

Ticket:
{ticket_text}
""".strip()

    response = client.messages.create(
        model=MODEL,
        system=SYSTEM,
        messages=[{"role": "user", "content": user_content}],
        max_tokens=1000,
        temperature=0,
    )

    text_parts = [
        block.text
        for block in response.content
        if hasattr(block, "text") and block.text
    ]
    return "\n".join(text_parts).strip()


def classify_ticket(ticket_text: str, max_attempts: int = 2) -> ParseResult:
    correction_error: str | None = None

    for attempt in range(1, max_attempts + 1):
        log.info("classify attempt=%d", attempt)
        raw_output = call_model(ticket_text, correction_error)
        result = parse_structured_output(raw_output)

        if result.ok:
            return result

        correction_error = result.error
        log.warning("parse failed: %s", result.error)

    return result


def print_result(result: ParseResult) -> None:
    if not result.ok or not result.data:
        print("\nParse failed:")
        print(result.error)
        print("\nRaw output:")
        print(result.raw)
        return

    print("\nParsed structured data:")
    print(json.dumps(result.data.__dict__, ensure_ascii=False, indent=2))

    print("\nBusiness routing example:")
    if result.data.category == "refund":
        route = "退款处理队列"
    elif result.data.category == "delivery":
        route = "物流处理队列"
    elif result.data.category == "account":
        route = "账号安全队列"
    else:
        route = "人工客服队列"

    escalation = result.data.priority == "high" or result.data.confidence < 0.6

    print(f"- route: {route}")
    print(f"- escalation_required: {str(escalation).lower()}")


def run_local_parser_demo() -> None:
    """A no-network parser check that demonstrates validation failures."""
    samples = [
        '{"category":"refund","priority":"high","summary":"用户要求退款","confidence":0.91,"reason":"用户明确表达退款诉求"}',
        '{"type":"退款","level":3}',
    ]

    print("Local parser demo:")
    for raw in samples:
        result = parse_structured_output(raw)
        status = "ok" if result.ok else f"failed: {result.error}"
        print(f"- {status}")
    print()


def main() -> None:
    run_local_parser_demo()

    print("Stage2 Structured Output Demo")
    print("Examples:")
    print("- 我买的课程打不开，已经付款了，麻烦尽快处理。")
    print("- 快递显示签收但我没有收到，订单号 12345。")
    print("- 这个会员我不想用了，能不能退钱？")
    print("Type q or exit to quit.\n")

    while True:
        try:
            ticket_text = input("\033[36mstructured >> \033[0m").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if ticket_text.lower() in {"", "q", "exit"}:
            break

        result = classify_ticket(ticket_text)
        print_result(result)
        print()


if __name__ == "__main__":
    main()
