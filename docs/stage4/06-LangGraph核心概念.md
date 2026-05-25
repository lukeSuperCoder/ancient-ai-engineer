# 06 - LangGraph 核心概念

---

## 为什么需要 LangGraph

前几节我们手写了 Agent 循环、DAG 执行引擎。但在生产环境中，你需要：

```
1. 状态管理 → 多步骤间传递数据
2. 持久化   → 任务中断后可以恢复
3. 人机协作 → 关键步骤需要人工审批
4. 可观测性 → 看到每一步的执行情况
```

手写这些功能很复杂。**LangGraph** 就是帮你解决这些问题的框架。

---

## LangGraph 是什么

> LangGraph 是 LangChain 团队开发的 Agent/Workflow 框架，核心思想是用**图（Graph）**来描述 AI 应用的行为。

### 核心理念

```
传统编程：用代码描述"做什么"
LangGraph：用"图"描述"流程"

图的组成：
  节点（Node） = 处理步骤
  边（Edge）   = 步骤间的流转
  状态（State）= 在节点间传递的数据
```

### 和我们前面学的对应关系

```
我们手写的概念      →  LangGraph 对应
────────────────────────────────────
DAGNode            →  Node
add_edge()         →  Edge
StateMachine       →  StateGraph
context 数据       →  State
```

---

## 核心概念 1：State（状态）

State 是 LangGraph 的核心——**所有节点共享的数据结构**。

```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph

# 定义状态
class AgentState(TypedDict):
    messages: list       # 对话历史
    current_tool: str    # 当前使用的工具
    tool_result: str     # 工具执行结果
    task_done: bool      # 任务是否完成
```

### State 的工作方式

```
┌─────────────────────────────────┐
│          State（共享状态）        │
│  {                              │
│    messages: [...],             │
│    current_tool: "search",      │
│    tool_result: "...",          │
│    task_done: false             │
│  }                              │
└────────┬───────────┬────────────┘
         │           │
    ┌────▼───┐  ┌───▼────┐
    │ Node A │  │ Node B │   ← 每个节点读写 State
    └────────┘  └────────┘
```

每个节点：
1. **读取** State 中的数据
2. **处理**逻辑
3. **更新** State（返回修改后的字段）

---

## 核心概念 2：Node（节点）

节点是一个**处理函数**，接收 State，返回 State 的更新。

```python
# 定义节点函数
def think(state: AgentState) -> dict:
    """思考节点：分析当前状态，决定下一步"""
    messages = state["messages"]
    response = llm.chat(messages)

    # 返回要更新的字段
    return {
        "messages": messages + [response],
        "current_tool": parse_tool(response)
    }

def act(state: AgentState) -> dict:
    """行动节点：执行工具调用"""
    tool = state["current_tool"]
    result = execute_tool(tool)

    return {
        "tool_result": result,
        "messages": state["messages"] + [{"role": "tool", "content": result}]
    }

def answer(state: AgentState) -> dict:
    """回答节点：生成最终回答"""
    return {
        "task_done": True
    }
```

---

## 核心概念 3：Edge（边）

边定义节点之间的**流转关系**。

### 普通 Edge（确定性的）

```python
# think 节点之后，一定到 act 节点
graph.add_edge("think", "act")
```

### 条件 Edge（动态的）

```python
def should_continue(state: AgentState) -> str:
    """根据状态决定下一步"""
    if state["task_done"]:
        return "answer"      # 任务完成 → 生成回答
    if state["current_tool"]:
        return "act"          # 还有工具要调用 → 执行
    return "think"            # 需要继续思考

# 添加条件边
graph.add_conditional_edges(
    "think",              # 从 think 节点出发
    should_continue,      # 根据这个函数决定去哪
    {
        "act": "act",     # 返回 "act" → 去 act 节点
        "answer": "answer", # 返回 "answer" → 去 answer 节点
        "think": "think"   # 返回 "think" → 回到 think 节点（循环）
    }
)
```

---

## 构建一个完整的 LangGraph Agent

```python
from langgraph.graph import StateGraph, END

# 1. 定义状态
class AgentState(TypedDict):
    messages: list
    tool_calls: list
    tool_results: list
    is_complete: bool

# 2. 定义节点函数
def agent_think(state: AgentState) -> dict:
    """Agent 思考：决定下一步做什么"""
    system_prompt = "你是一个有用的AI助手，可以搜索信息和计算。"
    messages = [{"role": "system", "content": system_prompt}] + state["messages"]

    response = llm.chat(messages, tools=AVAILABLE_TOOLS)

    # 检查是否调用了工具
    tool_calls = response.get("tool_calls", [])
    is_complete = len(tool_calls) == 0

    return {
        "messages": state["messages"] + [response],
        "tool_calls": tool_calls,
        "is_complete": is_complete
    }

def execute_tools(state: AgentState) -> dict:
    """执行工具调用"""
    results = []
    for call in state["tool_calls"]:
        result = execute_tool(call["name"], call["args"])
        results.append(result)

    return {
        "messages": state["messages"] + [
            {"role": "tool", "content": str(r)} for r in results
        ],
        "tool_results": results,
        "tool_calls": []
    }

# 3. 定义路由函数
def route_after_think(state: AgentState) -> str:
    if state["is_complete"]:
        return "end"
    return "execute"

# 4. 构建图
graph = StateGraph(AgentState)

# 添加节点
graph.add_node("think", agent_think)
graph.add_node("execute", execute_tools)

# 设置入口
graph.set_entry_point("think")

# 添加边
graph.add_conditional_edges(
    "think",
    route_after_think,
    {"execute": "execute", "end": END}
)
graph.add_edge("execute", "think")  # 执行完后回到思考

# 5. 编译并运行
app = graph.compile()

# 运行
result = app.invoke({
    "messages": [{"role": "user", "content": "北京今天天气怎么样？"}],
    "tool_calls": [],
    "tool_results": [],
    "is_complete": False
})

print(result["messages"][-1])  # 最终回答
```

### 这个 Agent 的流程图

```
            ┌──────────────────────┐
            │                      │
            ▼                      │
  ┌──────────────┐    需要工具     │
  │    think     │───────────────► │
  │  (AI思考)    │                 │
  └──────┬───────┘                 │
         │                         │
    is_complete?                   │
    ├── Yes → END                  │
    └── No → [execute] ───────────┘
              (执行工具)     回到think
```

这就是一个完整的 ReAct Agent！用 LangGraph 只需要定义节点和边。

---

## 核心概念 4：Checkpoint（检查点）

### 为什么需要 Checkpoint

```
问题场景：
  Agent 执行到第5步，突然崩溃了
  → 所有中间结果丢失
  → 要从头重新开始

有了 Checkpoint：
  Agent 每执行一步就保存状态
  → 崩溃后从最近的检查点恢复
  → 还可以实现"暂停/继续"
```

### 使用 Checkpoint

```python
from langgraph.checkpoint.memory import MemorySaver

# 创建检查点存储
checkpointer = MemorySaver()

# 编译时加上 checkpointer
app = graph.compile(checkpointer=checkpointer)

# 运行时指定线程ID
config = {"configurable": {"thread_id": "thread-1"}}

# 第一次运行（可能会在中间暂停）
result = app.invoke(input_data, config)

# 恢复运行
result = app.invoke(None, config)  # None 表示从检查点继续
```

### 实际应用场景

```
1. 人机协作：Agent 执行到关键步骤暂停，等人工确认后继续
2. 长时间任务：执行过程中保存进度，防止丢失
3. 调试：查看每一步的状态，定位问题
```

---

## LangGraph vs 手写 Agent

| 维度 | 手写 Agent | LangGraph |
|------|-----------|-----------|
| 开发速度 | 慢（自己写循环、状态） | 快（声明式定义图） |
| 状态管理 | 自己实现 | 内置 State |
| 持久化 | 自己实现 | 内置 Checkpoint |
| 调试 | 困难 | 可视化每一步 |
| 灵活性 | 完全自定义 | 框架约束内 |
| 学习成本 | 低（但实现复杂） | 中（需学框架概念） |

### 建议

```
学习阶段：
  → 先手写简单 Agent，理解原理
  → 再用 LangGraph，理解框架的价值

生产阶段：
  → 推荐用 LangGraph
  → 省去大量基础设施代码
```

---

## 学完本节你应该能回答

```
1. LangGraph 的三个核心概念是什么？
2. State 在节点间如何传递？
3. 条件 Edge 和普通 Edge 的区别？
4. Checkpoint 解决什么问题？
5. 什么时候用手写 Agent，什么时候用 LangGraph？
```

---

## 下一节

[07-Multi-Agent 系统实战](./07-Multi-Agent系统实战.md) →
