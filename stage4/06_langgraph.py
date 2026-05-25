#!/usr/bin/env python3
# LangGraph：用图结构编排 Agent 循环
"""
06_langgraph.py - LangGraph Agent
将 01_agent_loop.py 中的 while 循环改写为 LangGraph 的图结构。

核心变化：
  改造前：while True 手动跟踪状态
  改造后：声明式图结构，通过节点、边、共享状态编排

  01_agent_loop.py                  06_langgraph.py
  ─────────────────                 ─────────────────
  while True:                       graph = StateGraph(State)
      call_api()                        graph.add_node("think", think)
      parse_response()                  graph.add_node("execute", execute)
      if tool_use:                      graph.add_conditional_edges(...)
          execute()                     graph.add_edge("execute", "think")
          continue                  app = graph.compile()
      else: break                   app.invoke({"messages": [...]})
  return response

核心概念：
  State（状态）       -- 在节点间流动的共享数据（替代手动变量）
  Node（节点）        -- 读取状态并返回更新的函数
  Edge（边）          -- 节点间的固定连线（A 永远到 B）
  Conditional（条件边）-- 根据状态动态选择下一个节点
  Checkpoint（检查点）-- 每步保存状态（崩溃恢复、暂停/继续）

依赖安装：
  pip install langgraph
"""

import json
import os
import subprocess
from typing import TypedDict
from pathlib import Path

try:
    import readline
    readline.parse_and_bind('set bind-tty-special-chars off')
    readline.parse_and_bind('set input-meta on')
    readline.parse_and_bind('set output-meta on')
    readline.parse_and_bind('set convert-meta off')
    readline.parse_and_bind('set enable-meta-keybindings on')
except ImportError:
    pass

from anthropic import Anthropic
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

load_dotenv(override=True)
if os.getenv("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)

WORKDIR = Path.cwd()
client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))
MODEL = os.environ["MODEL_ID"]

# ---------------------------------------------------------------------------
# 1. State（状态）—— 在图中流动的共享数据结构
# ---------------------------------------------------------------------------
# 对比 01_agent_loop.py：LoopState 有 messages、turn_count、transition_reason。
# LangGraph 的 State 是同一个思路，但由图框架自动管理流转。

class AgentState(TypedDict):
    messages: list          # 完整对话历史
    tool_calls: list        # 上一次响应中待执行的工具调用
    is_complete: bool       # Agent 是否已完成任务
    turn_count: int         # think→execute 循环次数

# ---------------------------------------------------------------------------
# 2. 工具定义 —— 与前面文件相同，bash + read/write/edit
# ---------------------------------------------------------------------------

def safe_path(p: str) -> Path:
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"路径超出工作目录: {p}")
    return path

def run_bash(command: str) -> str:
    dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
    if any(d in command for d in dangerous):
        return "错误：危险命令已拦截"
    try:
        r = subprocess.run(command, shell=True, cwd=WORKDIR,
                           capture_output=True, text=True, timeout=120)
        out = (r.stdout + r.stderr).strip()
        return out[:50000] if out else "(无输出)"
    except subprocess.TimeoutExpired:
        return "错误：执行超时（120秒）"
    except (FileNotFoundError, OSError) as e:
        return f"错误：{e}"

def run_read(path: str, limit: int = None) -> str:
    try:
        lines = safe_path(path).read_text().splitlines()
        if limit and limit < len(lines):
            lines = lines[:limit] + [f"... (还有 {len(lines) - limit} 行)"]
        return "\n".join(lines)[:50000]
    except Exception as e:
        return f"错误：{e}"

def run_write(path: str, content: str) -> str:
    try:
        fp = safe_path(path)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content)
        return f"已写入 {len(content)} 字节到 {path}"
    except Exception as e:
        return f"错误：{e}"

def run_edit(path: str, old_text: str, new_text: str) -> str:
    try:
        fp = safe_path(path)
        content = fp.read_text()
        if old_text not in content:
            return f"错误：在 {path} 中未找到指定文本"
        fp.write_text(content.replace(old_text, new_text, 1))
        return f"已编辑 {path}"
    except Exception as e:
        return f"错误：{e}"

TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
}

TOOLS = [
    {"name": "bash", "description": "执行 shell 命令",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "read_file", "description": "读取文件内容",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["path"]}},
    {"name": "write_file", "description": "写入文件内容",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "edit_file", "description": "替换文件中的精确文本",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["path", "old_text", "new_text"]}},
]

SYSTEM = f"You are a coding agent at {WORKDIR}. Use tools to solve tasks. Act, don't explain."

# ---------------------------------------------------------------------------
# 3. Node（节点）—— 每个节点是一个函数：读取 State，返回更新
# ---------------------------------------------------------------------------
# 对比 01_agent_loop.py：run_one_turn() 把所有逻辑塞在一个函数里。
# 这里拆成两个节点："think"（调 LLM）和 "execute"（执行工具）。

def log(tag: str, msg: str) -> None:
    colors = {
        "状态": "\033[35m",
        "节点": "\033[34m",
        "路由": "\033[36m",
        "工具": "\033[33m",
        "完成": "\033[32m",
    }
    c = colors.get(tag, "\033[0m")
    print(f"{c}[{tag}] {msg}\033[0m")


def think(state: AgentState) -> dict:
    """节点：调用 LLM，分析当前状态并决定下一步。

    替代 while 循环中的"调用 API + 解析响应"部分。
    这里不判断是否继续循环，只更新 State，由条件边负责路由。
    """
    messages = state["messages"]
    turn = state.get("turn_count", 0) + 1

    log("节点", f"think() | 轮次={turn} | 消息数={len(messages)}")

    response = client.messages.create(
        model=MODEL,
        system=SYSTEM,
        messages=messages,
        tools=TOOLS,
        max_tokens=8000,
    )

    # 解析响应：提取工具调用和文本内容
    tool_calls = []
    text_parts = []
    for block in response.content:
        if block.type == "tool_use":
            tool_calls.append({
                "id": block.id,
                "name": block.name,
                "input": block.input,
            })
            log("节点", f"  工具调用: {block.name} | id={block.id}")
        elif hasattr(block, "text") and block.text:
            text_parts.append(block.text)

    is_complete = len(tool_calls) == 0
    log("节点", f"  是否完成={is_complete} | 待执行工具={len(tool_calls)}")

    # 将 assistant 消息追加到历史
    new_messages = messages + [{"role": "assistant", "content": response.content}]

    return {
        "messages": new_messages,
        "tool_calls": tool_calls,
        "is_complete": is_complete,
        "turn_count": turn,
    }


def execute(state: AgentState) -> dict:
    """节点：执行待处理的工具调用。

    替代 while 循环中的"执行工具 + 追加结果"部分。
    """
    tool_calls = state["tool_calls"]

    log("节点", f"execute() | 待执行工具={len(tool_calls)}")

    results = []
    for call in tool_calls:
        handler = TOOL_HANDLERS.get(call["name"])
        if handler:
            log("工具", f"  {call['name']}({json.dumps(call['input'], ensure_ascii=False)[:100]})")
            output = handler(**call["input"])
            preview = output[:150].replace("\n", "\\n")
            log("工具", f"  → {len(output)} 字符 | {preview}")
        else:
            output = f"未知工具: {call['name']}"
        results.append({
            "type": "tool_result",
            "tool_use_id": call["id"],
            "content": output,
        })

    # 将工具结果作为 user 消息追加
    new_messages = state["messages"] + [{"role": "user", "content": results}]

    return {
        "messages": new_messages,
        "tool_calls": [],       # 清空待执行列表
    }

# ---------------------------------------------------------------------------
# 4. Conditional Edge（条件边）—— 决定 think 之后去哪个节点
# ---------------------------------------------------------------------------
# 对比 01_agent_loop.py：循环内的 "if stop_reason == 'tool_use'" 判断。
# 不再用 if/else，而是通过路由函数声明式地定义分支。

def route_after_think(state: AgentState) -> str:
    """think 节点执行后，决定去执行工具还是结束。

    返回值：
        "execute" → 跳转到 execute 节点（还有工具要调用）
        "end"     → 结束图执行（任务已完成）
    """
    if state["is_complete"]:
        log("路由", "route_after_think → END（任务已完成）")
        return "end"

    log("路由", f"route_after_think → execute（{len(state['tool_calls'])} 个工具待执行）")
    return "execute"

# ---------------------------------------------------------------------------
# 5. 构建图
# ---------------------------------------------------------------------------
#
#  图结构：
#
#       ┌───────────────────────────┐
#       │                           │
#       ▼                           │
#    [think] ──是否完成?──┐         │
#       │                 │         │
#       ├── 是 → END      │         │
#       └── 否 → [execute]┘─────────┘
#
#  这和 01_agent_loop.py 的 ReAct 循环完全等价，
#  只是用声明式图代替了命令式 while 循环。

def build_graph():
    graph = StateGraph(AgentState)

    # 添加节点
    graph.add_node("think", think)
    graph.add_node("execute", execute)

    # 设置入口节点
    graph.set_entry_point("think")

    # 条件边：think 之后 → execute 或 END
    graph.add_conditional_edges(
        "think",
        route_after_think,
        {"execute": "execute", "end": END},
    )

    # 固定边：execute 之后 → 回到 think（形成循环）
    graph.add_edge("execute", "think")

    return graph

# ---------------------------------------------------------------------------
# 6. 编译（可选 Checkpoint）
# ---------------------------------------------------------------------------
# Checkpoint 会在每个节点执行后保存状态。
# 用途：暂停/继续、崩溃恢复、状态检查。
#
# 用法：
#   不启用：app = graph.compile()
#   启用：  app = graph.compile(checkpointer=MemorySaver())
#
# 启用 Checkpoint 时，调用时必须传入 thread_id：
#   config = {"configurable": {"thread_id": "session-1"}}
#   app.invoke(input, config)

def create_app(use_checkpoint: bool = False):
    graph = build_graph()
    if use_checkpoint:
        checkpointer = MemorySaver()
        app = graph.compile(checkpointer=checkpointer)
        log("状态", "图已编译（启用 Checkpoint / MemorySaver）")
    else:
        app = graph.compile()
        log("状态", "图已编译（未启用 Checkpoint）")
    return app

# ---------------------------------------------------------------------------
# 7. 辅助函数：从消息中提取最终文本
# ---------------------------------------------------------------------------

def extract_final_text(messages: list) -> str:
    last = messages[-1]
    content = last.get("content", [])
    if isinstance(content, str):
        return content
    texts = []
    for block in content:
        text = getattr(block, "text", None) or (block.get("text") if isinstance(block, dict) else None)
        if text:
            texts.append(text)
    return "\n".join(texts).strip()

# ---------------------------------------------------------------------------
# 8. 主入口 —— 交互模式（与 01~05 文件保持一致的体验）
# ---------------------------------------------------------------------------

def print_state_summary(state: AgentState):
    """打印当前状态的简要摘要"""
    log("状态", f"消息数={len(state['messages'])} | "
                f"轮次={state.get('turn_count', 0)} | "
                f"已完成={state.get('is_complete', False)} | "
                f"待执行工具={len(state.get('tool_calls', []))}")


if __name__ == "__main__":
    import sys

    # 解析命令行参数
    use_checkpoint = "--checkpoint" in sys.argv or "-c" in sys.argv

    app = create_app(use_checkpoint=use_checkpoint)

    print(f"\033[1;35m{'='*60}\033[0m")
    print(f"\033[1;35m  06 LangGraph Agent | 模型={MODEL}\033[0m")
    print(f"\033[1;35m  检查点={'已启用' if use_checkpoint else '未启用'}\033[0m")
    print(f"\033[1;35m{'='*60}\033[0m")
    print()
    print("  图结构:")
    print("    [think] → 是否完成? → [execute] → [think]（循环）")
    print("                    └──→ END（完成）")
    print()
    print("  使用说明:")
    print("    输入问题开始对话")
    print("    输入 'q' 或 'exit' 退出")
    print("    加 '--checkpoint' 或 '-c' 参数启用检查点")
    print()

    history = []
    thread_counter = 0

    while True:
        try:
            query = input("\033[36m06 >> \033[0m")
        except (EOFError, KeyboardInterrupt):
            break

        if query.strip().lower() in ("q", "exit", ""):
            break

        # 构建初始状态
        history.append({"role": "user", "content": query})
        initial_state = {
            "messages": history,
            "tool_calls": [],
            "is_complete": False,
            "turn_count": 0,
        }

        # 运行图
        log("状态", f"启动图执行，当前消息数={len(history)}")

        if use_checkpoint:
            thread_counter += 1
            config = {"configurable": {"thread_id": f"thread-{thread_counter}"}}
            result = app.invoke(initial_state, config)
        else:
            result = app.invoke(initial_state)

        # 从结果中更新历史
        history = result["messages"]

        # 打印最终回答
        final = extract_final_text(history)
        if final:
            print(f"\033[1;37m{final}\033[0m")

        print_state_summary(result)
        print()
