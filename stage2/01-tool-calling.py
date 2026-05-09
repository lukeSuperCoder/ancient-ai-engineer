#!/usr/bin/env python3
"""
01-tool-calling.py

Stage 2 example: Tool Calling + Tool Schema + Tool Registry + Tool Executor.

This file follows the same model-call style as stage1/learncc/s02_tool_use.py,
but the tools are product-style external capabilities instead of file tools:

- get_weather
- get_current_time
- convert_currency
- search_news

Run:
    python3 stage2/01-tool-calling.py

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
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from anthropic import Anthropic
from dotenv import load_dotenv


logging.basicConfig(
    level=logging.INFO,
    format="\033[33m[%(asctime)s %(levelname)s]\033[0m %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("stage2-tool-calling")

load_dotenv(override=True)

if os.getenv("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)

MODEL = os.getenv("MODEL_ID")
if not MODEL:
    raise RuntimeError("Missing MODEL_ID. Set it in .env or your shell.")

client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))

SYSTEM = """
You are an AI Tool Agent demo.

Rules:
- Use tools when the user asks for weather, current time, currency conversion,
  or recent news.
- Do not invent real-time data. If a tool returns mock data, clearly say it is
  demo data.
- After receiving tool results, answer in concise Chinese.
""".strip()


JSONSchema = dict[str, Any]
ToolHandler = Callable[[dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: JSONSchema
    handler: ToolHandler

    def to_anthropic_tool(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


@dataclass(frozen=True)
class ToolExecutionResult:
    ok: bool
    tool: str | None = None
    data: Any = None
    error: str | None = None
    retryable: bool = False

    def to_json(self) -> str:
        payload = {
            "ok": self.ok,
            "tool": self.tool,
            "data": self.data,
            "error": self.error,
            "retryable": self.retryable,
        }
        return json.dumps(payload, ensure_ascii=False, indent=2)


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Duplicate tool: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.to_anthropic_tool() for tool in self._tools.values()]


def validate_arguments(schema: JSONSchema, arguments: Any) -> dict[str, Any]:
    """Small JSON Schema validator for this demo.

    It supports the subset used below: object, properties, required,
    additionalProperties, string, number, integer, and enum.
    """
    if schema.get("type") != "object":
        raise ValueError("Only object schemas are supported in this demo.")

    if not isinstance(arguments, dict):
        raise ValueError("Tool arguments must be an object.")

    properties = schema.get("properties", {})
    required = schema.get("required", [])
    allow_extra = schema.get("additionalProperties", True)

    for field in required:
        if field not in arguments:
            raise ValueError(f"Missing required argument: {field}")

    if not allow_extra:
        extra_fields = set(arguments) - set(properties)
        if extra_fields:
            raise ValueError(f"Unexpected argument(s): {sorted(extra_fields)}")

    for field, value in arguments.items():
        if field not in properties:
            continue

        spec = properties[field]
        expected_type = spec.get("type")

        if expected_type == "string" and not isinstance(value, str):
            raise ValueError(f"{field} must be a string.")
        if expected_type == "number" and not isinstance(value, (int, float)):
            raise ValueError(f"{field} must be a number.")
        if expected_type == "integer" and not isinstance(value, int):
            raise ValueError(f"{field} must be an integer.")

        enum = spec.get("enum")
        if enum and value not in enum:
            raise ValueError(f"{field} must be one of {enum}.")

    return arguments


def execute_tool_call(
    registry: ToolRegistry,
    name: str,
    arguments: Any,
) -> ToolExecutionResult:
    tool = registry.get(name)
    if not tool:
        return ToolExecutionResult(
            ok=False,
            error=f"Unknown tool: {name}",
            retryable=False,
        )

    try:
        validated_args = validate_arguments(tool.input_schema, arguments)
        data = tool.handler(validated_args)
        return ToolExecutionResult(ok=True, tool=tool.name, data=data)
    except Exception as exc:
        return ToolExecutionResult(
            ok=False,
            tool=tool.name,
            error=str(exc),
            retryable=True,
        )


def get_weather(args: dict[str, Any]) -> dict[str, Any]:
    city = args["city"]
    date = args["date"]
    demo_weather = {
        "北京": ("晴", 18, 27, 0.1),
        "上海": ("多云", 21, 28, 0.25),
        "深圳": ("阵雨", 24, 30, 0.65),
        "杭州": ("小雨", 20, 25, 0.7),
    }
    weather, min_temp, max_temp, rain = demo_weather.get(
        city,
        ("晴", 19, 26, 0.2),
    )

    return {
        "source": "mock",
        "city": city,
        "date": date,
        "weather": weather,
        "temperatureMin": min_temp,
        "temperatureMax": max_temp,
        "rainProbability": rain,
    }


def get_current_time(args: dict[str, Any]) -> dict[str, Any]:
    timezone = args["timezone"]
    try:
        now = datetime.now(ZoneInfo(timezone))
    except ZoneInfoNotFoundError as exc:
        raise ValueError(
            "Invalid timezone. Use an IANA timezone like Asia/Shanghai."
        ) from exc

    return {
        "timezone": timezone,
        "currentTime": now.isoformat(timespec="seconds"),
        "weekday": now.strftime("%A"),
    }


def convert_currency(args: dict[str, Any]) -> dict[str, Any]:
    amount = float(args["amount"])
    from_currency = args["fromCurrency"].upper()
    to_currency = args["toCurrency"].upper()

    mock_rates = {
        ("USD", "CNY"): 7.2,
        ("CNY", "USD"): 0.139,
        ("JPY", "CNY"): 0.046,
        ("CNY", "JPY"): 21.7,
        ("EUR", "CNY"): 7.8,
        ("CNY", "EUR"): 0.128,
    }

    rate = mock_rates.get((from_currency, to_currency))
    if rate is None:
        raise ValueError(
            f"Unsupported currency pair: {from_currency}->{to_currency}"
        )

    return {
        "source": "mock",
        "amount": amount,
        "fromCurrency": from_currency,
        "toCurrency": to_currency,
        "rate": rate,
        "convertedAmount": round(amount * rate, 2),
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
    }


def search_news(args: dict[str, Any]) -> dict[str, Any]:
    query = args["query"]
    limit = min(args.get("limit", 3), 5)

    articles = [
        {
            "title": f"{query} 相关新闻 {index + 1}",
            "summary": "这是 Tool Calling 学习示例中的 mock 新闻摘要。",
            "source": "Mock News",
            "publishedAt": datetime.now().date().isoformat(),
        }
        for index in range(limit)
    ]

    return {
        "source": "mock",
        "query": query,
        "articles": articles,
    }


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()

    registry.register(
        ToolDefinition(
            name="get_weather",
            description=(
                "当用户想查询某个城市某一天的天气、温度、降雨概率时使用。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称，例如 北京、上海、深圳",
                    },
                    "date": {
                        "type": "string",
                        "description": "日期，例如 今天、明天、2026-05-09",
                    },
                },
                "required": ["city", "date"],
                "additionalProperties": False,
            },
            handler=get_weather,
        )
    )

    registry.register(
        ToolDefinition(
            name="get_current_time",
            description=(
                "当用户想查询某个时区的当前日期、时间或星期时使用。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": (
                            "IANA 时区，例如 Asia/Shanghai、"
                            "America/New_York、Europe/London"
                        ),
                    },
                },
                "required": ["timezone"],
                "additionalProperties": False,
            },
            handler=get_current_time,
        )
    )

    registry.register(
        ToolDefinition(
            name="convert_currency",
            description="当用户需要换算不同货币金额时使用。",
            input_schema={
                "type": "object",
                "properties": {
                    "amount": {
                        "type": "number",
                        "description": "需要换算的原始金额",
                    },
                    "fromCurrency": {
                        "type": "string",
                        "description": "原始货币代码，例如 USD、CNY、JPY",
                    },
                    "toCurrency": {
                        "type": "string",
                        "description": "目标货币代码，例如 CNY、USD、EUR",
                    },
                },
                "required": ["amount", "fromCurrency", "toCurrency"],
                "additionalProperties": False,
            },
            handler=convert_currency,
        )
    )

    registry.register(
        ToolDefinition(
            name="search_news",
            description="当用户需要搜索某个主题的近期新闻或动态时使用。",
            input_schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "新闻搜索关键词",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量，默认 3，最大 5",
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            handler=search_news,
        )
    )

    return registry


def normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove internal-only fields before sending history to the API."""
    normalized = []
    for message in messages:
        content = message["content"]
        if isinstance(content, list):
            content = [
                {key: value for key, value in block.items() if not key.startswith("_")}
                if isinstance(block, dict)
                else block
                for block in content
            ]
        normalized.append({"role": message["role"], "content": content})
    return normalized


def agent_loop(messages: list[dict[str, Any]], registry: ToolRegistry) -> None:
    iteration = 0
    while True:
        iteration += 1
        log.info("agent_loop iteration=%d messages=%d", iteration, len(messages))

        response = client.messages.create(
            model=MODEL,
            system=SYSTEM,
            messages=normalize_messages(messages),
            tools=registry.schemas(),
            max_tokens=2000,
        )

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            log.info("tool_call name=%s input=%s", block.name, block.input)
            result = execute_tool_call(registry, block.name, block.input)
            print(f"\n> tool: {block.name}")
            print(result.to_json())

            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result.to_json(),
                }
            )

        messages.append({"role": "user", "content": tool_results})


def print_last_assistant_text(messages: list[dict[str, Any]]) -> None:
    if not messages:
        return

    content = messages[-1]["content"]
    if not isinstance(content, list):
        print(content)
        return

    for block in content:
        if hasattr(block, "text") and block.text:
            print(block.text)


def main() -> None:
    registry = build_registry()
    messages: list[dict[str, Any]] = []

    print("Stage2 Tool Calling Demo")
    print("Examples:")
    print("- 明天北京天气怎么样？")
    print("- 纽约现在几点？请用 America/New_York 查询")
    print("- 100 美元换算成人民币是多少？")
    print("- 帮我查 3 条 AI Agent 新闻")
    print("Type q or exit to quit.\n")

    while True:
        try:
            query = input("\033[36mstage2 tool >> \033[0m").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if query.lower() in {"", "q", "exit"}:
            break

        messages.append({"role": "user", "content": query})
        agent_loop(messages, registry)
        print("\nassistant:")
        print_last_assistant_text(messages)
        print()


if __name__ == "__main__":
    main()
