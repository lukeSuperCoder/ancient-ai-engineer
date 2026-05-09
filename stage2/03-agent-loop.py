#!/usr/bin/env python3
"""
03-agent-loop.py

Stage 2 example: Agent loop + message history + execution trace.

This demo builds on 01-tool-calling.py. The important part is not the mock
tools themselves, but the loop:

1. Send messages and tool schemas to the model.
2. If the model asks for tools, execute them.
3. Append tool_result blocks back into message history.
4. Continue until the model returns a final answer or max_steps is reached.

Run:
    python3 stage2/03-agent-loop.py

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
import time
from dataclasses import dataclass, field
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
log = logging.getLogger("stage2-agent-loop")

load_dotenv(override=True)

if os.getenv("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)

MODEL = os.getenv("MODEL_ID")
if not MODEL:
    raise RuntimeError("Missing MODEL_ID. Set it in .env or your shell.")

client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))

SYSTEM = """
You are an AI Tool Agent demo.

Use tools when the user asks for weather, time, currency conversion, or news.
You may call more than one tool if the task needs multiple facts.

Important:
- Tool results with "source": "mock" are demo data. Say that clearly.
- After all needed tool results are available, give a concise Chinese answer.
- Do not repeatedly call the same tool with the same arguments.
""".strip()


JSONSchema = dict[str, Any]
ToolHandler = Callable[[dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: JSONSchema
    handler: ToolHandler

    def schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    tool: str | None = None
    data: Any = None
    error: str | None = None
    retryable: bool = False

    def to_json(self) -> str:
        return json.dumps(
            {
                "ok": self.ok,
                "tool": self.tool,
                "data": self.data,
                "error": self.error,
                "retryable": self.retryable,
            },
            ensure_ascii=False,
            indent=2,
        )


@dataclass
class AgentStep:
    step_index: int
    type: str
    name: str | None = None
    input: Any = None
    output: Any = None
    error: str | None = None
    started_at: float = field(default_factory=time.time)
    ended_at: float = field(default_factory=time.time)

    @property
    def duration_ms(self) -> int:
        return int((self.ended_at - self.started_at) * 1000)


@dataclass
class AgentState:
    messages: list[dict[str, Any]]
    steps: list[AgentStep] = field(default_factory=list)
    max_steps: int = 5
    max_tool_calls: int = 8
    started_at: float = field(default_factory=time.time)
    tool_call_count: int = 0


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
        return [tool.schema() for tool in self._tools.values()]


def validate_arguments(schema: JSONSchema, arguments: Any) -> dict[str, Any]:
    if schema.get("type") != "object":
        raise ValueError("Only object schemas are supported.")
    if not isinstance(arguments, dict):
        raise ValueError("Tool arguments must be an object.")

    properties = schema.get("properties", {})
    required = schema.get("required", [])
    allow_extra = schema.get("additionalProperties", True)

    for field_name in required:
        if field_name not in arguments:
            raise ValueError(f"Missing required argument: {field_name}")

    if not allow_extra:
        extra = set(arguments) - set(properties)
        if extra:
            raise ValueError(f"Unexpected argument(s): {sorted(extra)}")

    for field_name, value in arguments.items():
        spec = properties.get(field_name)
        if not spec:
            continue

        expected = spec.get("type")
        if expected == "string" and not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string.")
        if expected == "number" and not isinstance(value, (int, float)):
            raise ValueError(f"{field_name} must be a number.")
        if expected == "integer" and not isinstance(value, int):
            raise ValueError(f"{field_name} must be an integer.")

    return arguments


def execute_tool_call(
    registry: ToolRegistry,
    name: str,
    arguments: Any,
) -> ToolResult:
    tool = registry.get(name)
    if not tool:
        return ToolResult(
            ok=False,
            error=f"Unknown tool: {name}",
            retryable=False,
        )

    try:
        validated = validate_arguments(tool.input_schema, arguments)
        return ToolResult(ok=True, tool=tool.name, data=tool.handler(validated))
    except Exception as exc:
        return ToolResult(
            ok=False,
            tool=tool.name,
            error=str(exc),
            retryable=True,
        )


def get_weather(args: dict[str, Any]) -> dict[str, Any]:
    city = args["city"]
    date = args["date"]
    data = {
        "北京": ("晴", 18, 27, 0.1),
        "上海": ("多云", 21, 28, 0.25),
        "深圳": ("阵雨", 24, 30, 0.65),
        "杭州": ("小雨", 20, 25, 0.7),
    }
    weather, min_temp, max_temp, rain = data.get(city, ("晴", 19, 26, 0.2))
    return {
        "source": "mock",
        "city": city,
        "date": date,
        "weather": weather,
        "temperatureMin": min_temp,
        "temperatureMax": max_temp,
        "rainProbability": rain,
        "suitableForTravel": rain < 0.5 and weather not in {"暴雨", "大雪"},
    }


def get_current_time(args: dict[str, Any]) -> dict[str, Any]:
    timezone = args["timezone"]
    try:
        now = datetime.now(ZoneInfo(timezone))
    except ZoneInfoNotFoundError as exc:
        raise ValueError(
            "Invalid timezone. Use IANA names like Asia/Shanghai."
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
    rates = {
        ("USD", "CNY"): 7.2,
        ("CNY", "USD"): 0.139,
        ("JPY", "CNY"): 0.046,
        ("CNY", "JPY"): 21.7,
        ("EUR", "CNY"): 7.8,
        ("CNY", "EUR"): 0.128,
    }
    rate = rates.get((from_currency, to_currency))
    if rate is None:
        raise ValueError(f"Unsupported currency pair: {from_currency}->{to_currency}")

    return {
        "source": "mock",
        "amount": amount,
        "fromCurrency": from_currency,
        "toCurrency": to_currency,
        "rate": rate,
        "convertedAmount": round(amount * rate, 2),
    }


def search_news(args: dict[str, Any]) -> dict[str, Any]:
    query = args["query"]
    limit = min(args.get("limit", 3), 5)
    return {
        "source": "mock",
        "query": query,
        "articles": [
            {
                "title": f"{query} 相关新闻 {index + 1}",
                "summary": "这是 Agent Loop 学习示例中的 mock 新闻摘要。",
                "source": "Mock News",
                "publishedAt": datetime.now().date().isoformat(),
            }
            for index in range(limit)
        ],
    }


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="get_weather",
            description="查询城市在指定日期的天气、温度和是否适合出行。",
            input_schema={
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"},
                    "date": {"type": "string", "description": "日期，例如 今天、明天"},
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
            description="查询指定 IANA 时区的当前日期时间。",
            input_schema={
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "例如 Asia/Shanghai、America/New_York",
                    }
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
            description="换算不同货币金额。",
            input_schema={
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "原始金额"},
                    "fromCurrency": {"type": "string", "description": "原始货币代码"},
                    "toCurrency": {"type": "string", "description": "目标货币代码"},
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
            description="搜索某个主题的近期新闻或动态。",
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "新闻关键词"},
                    "limit": {"type": "integer", "description": "返回数量，最大 5"},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            handler=search_news,
        )
    )
    return registry


def normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def assistant_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return "\n".join(
        block.text
        for block in content
        if hasattr(block, "text") and block.text
    ).strip()


def run_agent(
    user_input: str,
    registry: ToolRegistry,
    max_steps: int = 5,
    max_tool_calls: int = 8,
) -> tuple[str, AgentState]:
    state = AgentState(
        messages=[{"role": "user", "content": user_input}],
        max_steps=max_steps,
        max_tool_calls=max_tool_calls,
    )

    for step_index in range(state.max_steps):
        model_started = time.time()
        response = client.messages.create(
            model=MODEL,
            system=SYSTEM,
            messages=normalize_messages(state.messages),
            tools=registry.schemas(),
            max_tokens=2000,
        )
        model_ended = time.time()

        state.messages.append({"role": "assistant", "content": response.content})
        state.steps.append(
            AgentStep(
                step_index=step_index,
                type="model",
                output={
                    "stop_reason": response.stop_reason,
                    "text": assistant_text(response.content),
                    "tool_calls": [
                        {"name": block.name, "input": block.input}
                        for block in response.content
                        if block.type == "tool_use"
                    ],
                },
                started_at=model_started,
                ended_at=model_ended,
            )
        )

        if response.stop_reason != "tool_use":
            return assistant_text(response.content), state

        tool_result_blocks = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            if state.tool_call_count >= state.max_tool_calls:
                return "工具调用次数过多，Agent 已停止。", state

            state.tool_call_count += 1
            tool_started = time.time()
            result = execute_tool_call(registry, block.name, block.input)
            tool_ended = time.time()

            state.steps.append(
                AgentStep(
                    step_index=step_index,
                    type="tool",
                    name=block.name,
                    input=block.input,
                    output=json.loads(result.to_json()),
                    error=result.error,
                    started_at=tool_started,
                    ended_at=tool_ended,
                )
            )
            tool_result_blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result.to_json(),
                }
            )

        state.messages.append({"role": "user", "content": tool_result_blocks})

    return "任务执行步数过多，Agent 已停止。请缩小问题范围后重试。", state


def print_trace(state: AgentState) -> None:
    print("\nExecution trace:")
    for index, step in enumerate(state.steps, start=1):
        title = f"{index}. step={step.step_index} type={step.type}"
        if step.name:
            title += f" name={step.name}"
        title += f" duration={step.duration_ms}ms"
        print(title)

        if step.input is not None:
            print("   input:")
            print(indent_json(step.input, prefix="   "))

        if step.output is not None:
            print("   output:")
            print(indent_json(step.output, prefix="   "))

        if step.error:
            print(f"   error: {step.error}")


def indent_json(value: Any, prefix: str) -> str:
    text = json.dumps(value, ensure_ascii=False, indent=2)
    return "\n".join(prefix + line for line in text.splitlines())


def main() -> None:
    registry = build_registry()

    print("Stage2 Agent Loop Demo")
    print("Examples:")
    print("- 如果北京明天天气适合出行，帮我查 2 条北京周末活动新闻。")
    print("- 纽约现在几点？顺便把 100 美元换算成人民币。")
    print("- 明天深圳会下雨吗？如果下雨，查一下室内活动新闻。")
    print("Type q or exit to quit.\n")

    while True:
        try:
            query = input("\033[36magent loop >> \033[0m").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if query.lower() in {"", "q", "exit"}:
            break

        answer, state = run_agent(query, registry)
        print("\nassistant:")
        print(answer)
        print_trace(state)
        print()


if __name__ == "__main__":
    main()
