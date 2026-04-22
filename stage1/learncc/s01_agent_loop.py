#!/usr/bin/env python3
# Harness: the loop -- keep feeding real tool results back into the model.
"""
s01_agent_loop.py - The Agent Loop
This file teaches the smallest useful coding-agent pattern:
    user message
      -> model reply
      -> if tool_use: execute tools
      -> write tool_result back to messages
      -> continue
It intentionally keeps the loop small, but still makes the loop state explicit
so later chapters can grow from the same structure.
"""
import os
import subprocess
from dataclasses import dataclass
try:
    import readline
    # #143 UTF-8 backspace fix for macOS libedit
    readline.parse_and_bind('set bind-tty-special-chars off')
    readline.parse_and_bind('set input-meta on')
    readline.parse_and_bind('set output-meta on')
    readline.parse_and_bind('set convert-meta off')
    readline.parse_and_bind('set enable-meta-keybindings on')
except ImportError:
    pass
from anthropic import Anthropic
from dotenv import load_dotenv
load_dotenv(override=True)
if os.getenv("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)
client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))
MODEL = os.environ["MODEL_ID"]
SYSTEM = (
    f"You are a coding agent at {os.getcwd()}. "
    "Use bash to inspect and change the workspace. Act first, then report clearly."
)
TOOLS = [{
    "name": "bash",
    "description": "Run a shell command in the current workspace.",
    "input_schema": {
        "type": "object",
        "properties": {"command": {"type": "string"}},
        "required": ["command"],
    },
}]
@dataclass
class LoopState:
    # The minimal loop state: history, loop count, and why we continue.
    messages: list
    turn_count: int = 1
    transition_reason: str | None = None
def run_bash(command: str) -> str:
    dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
    if any(item in command for item in dangerous):
        return "Error: Dangerous command blocked"
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return "Error: Timeout (120s)"
    except (FileNotFoundError, OSError) as e:
        return f"Error: {e}"
    output = (result.stdout + result.stderr).strip()
    return output[:50000] if output else "(no output)"
def log_phase(tag: str, msg: str) -> None:
    colors = {
        "LOOP": "\033[35m",      # magenta
        "API": "\033[34m",       # blue
        "RESP": "\033[32m",      # green
        "TOOL": "\033[33m",      # yellow
        "DECIDE": "\033[36m",    # cyan
        "MSG": "\033[90m",       # gray
    }
    c = colors.get(tag, "\033[0m")
    print(f"{c}[{tag}] {msg}\033[0m")
def extract_text(content) -> str:
    if not isinstance(content, list):
        return ""
    texts = []
    for block in content:
        text = getattr(block, "text", None)
        if text:
            texts.append(text)
    return "\n".join(texts).strip()
def execute_tool_calls(response_content) -> list[dict]:
    results = []
    tool_count = sum(1 for b in response_content if b.type == "tool_use")
    log_phase("TOOL", f"检测到 {tool_count} 个工具调用，开始逐一执行")
    for idx, block in enumerate(response_content, 1):
        if block.type != "tool_use":
            block_summary = block.text[:80] if hasattr(block, "text") and block.text else "(non-text block)"
            log_phase("MSG", f"  跳过非工具块: type={block.type}, preview={block_summary}")
            continue
        command = block.input["command"]
        log_phase("TOOL", f"  [{idx}/{tool_count}] tool_use_id={block.id}")
        log_phase("TOOL", f"  [{idx}/{tool_count}] 执行命令: $ {command}")
        output = run_bash(command)
        preview = output[:150].replace("\n", "\\n")
        log_phase("TOOL", f"  [{idx}/{tool_count}] 输出({len(output)} chars): {preview}")
        results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": output,
        })
    log_phase("TOOL", f"工具执行完毕，共产生 {len(results)} 个 tool_result")
    return results
def run_one_turn(state: LoopState) -> bool:
    log_phase("API", f"▶ 发起 API 请求 | model={MODEL} | 历史消息数={len(state.messages)} | turn={state.turn_count}")
    response = client.messages.create(
        model=MODEL,
        system=SYSTEM,
        messages=state.messages,
        tools=TOOLS,
        max_tokens=8000,
    )
    log_phase("RESP", f"◀ 收到响应 | stop_reason={response.stop_reason} | content_blocks={len(response.content)} | usage={response.usage}")
    # 详情：每个 content block 的类型和摘要
    for i, block in enumerate(response.content):
        if block.type == "text":
            preview = block.text[:100].replace("\n", "\\n")
            log_phase("RESP", f"  block[{i}] type=text | preview: {preview}")
        elif block.type == "tool_use":
            log_phase("RESP", f"  block[{i}] type=tool_use | name={block.name} | id={block.id} | input={block.input}")
        else:
            log_phase("RESP", f"  block[{i}] type={block.type}")

    state.messages.append({"role": "assistant", "content": response.content})
    log_phase("MSG", f"assistant 消息已追加到历史 (共 {len(state.messages)} 条)")

    log_phase("DECIDE", f"判断 stop_reason={response.stop_reason}")
    if response.stop_reason != "tool_use":
        log_phase("DECIDE", f"stop_reason={response.stop_reason} ≠ 'tool_use' → 循环结束，输出最终回复")
        state.transition_reason = None
        return False

    results = execute_tool_calls(response.content)
    if not results:
        log_phase("DECIDE", "无有效工具结果 → 循环结束")
        state.transition_reason = None
        return False

    state.messages.append({"role": "user", "content": results})
    log_phase("MSG", f"tool_result 消息已追加到历史 (共 {len(state.messages)} 条)")
    state.turn_count += 1
    state.transition_reason = "tool_result"
    log_phase("DECIDE", f"工具结果已回写 → 继续循环 (下一轮 turn={state.turn_count})")
    return True
def agent_loop(state: LoopState) -> None:
    log_phase("LOOP", f"========== Agent Loop 开始 | 初始历史消息数={len(state.messages)} ==========")
    while run_one_turn(state):
        log_phase("LOOP", f"---------- 第 {state.turn_count} 轮完成，transition_reason={state.transition_reason} ----------")
    log_phase("LOOP", f"========== Agent Loop 结束 | 共执行 {state.turn_count} 轮 ==========")
if __name__ == "__main__":
    history = []
    print(f"\033[1;35m=== s01 Agent Loop 交互模式 | model={MODEL} ===\033[0m")
    while True:
        try:
            query = input("\033[36ms01 >> \033[0m")
        except (EOFError, KeyboardInterrupt):
            break
        if query.strip().lower() in ("q", "exit", ""):
            break
        log_phase("MSG", f"用户输入: \"{query}\" → 追加 user 消息到历史")
        history.append({"role": "user", "content": query})
        state = LoopState(messages=history)
        agent_loop(state)
        log_phase("MSG", f"循环结束后历史消息数={len(history)}，提取最终文本回复")
        final_text = extract_text(history[-1]["content"])
        if final_text:
            print(f"\033[1;37m{final_text}\033[0m")
        print()
