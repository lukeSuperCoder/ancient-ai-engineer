# 01 - Agent 基础与 ReAct 模式

---

## 什么是 Agent

一句话定义：

> **Agent = LLM + 循环 + 工具 + 自主决策**

普通 LLM 调用是**一问一答**，Agent 是**持续思考、持续行动、直到任务完成**。

### 对比理解

| 维度 | 普通 LLM | Agent |
|------|----------|-------|
| 交互方式 | 单轮问答 | 多轮循环 |
| 工具使用 | 不用或被动用 | 主动选择调用 |
| 决策能力 | 无 | 自己决定下一步 |
| 终止条件 | 回答完就停 | 任务完成才停 |
| 错误处理 | 无 | 可以重试/换策略 |

### 生活类比

**普通 LLM**：像一本百科全书，你问一个问题，它给你一个答案。

**Agent**：像一个实习生：
1. 收到任务后先思考怎么做
2. 发现有需要查资料的地方，去查
3. 查完发现还需要打电话确认，去打
4. 把所有信息汇总，完成任务
5. 如果中间发现搞错了，还能回头重来

---

## Agent 的核心循环

所有 Agent 都遵循同一个基本模式：

```
┌─────────────────────────────────┐
│                                 │
│   Thought（思考）                │
│       ↓                         │
│   Action（行动：调工具/查资料）    │
│       ↓                         │
│   Observation（观察结果）         │
│       ↓                         │
│   回到 Thought（继续思考）        │
│       ↓                         │
│   ... 直到能给出最终回答          │
│                                 │
└─────────────────────────────────┘
```

这个循环就是 **ReAct 模式**。

---

## ReAct 模式详解

ReAct = **Re**asoning + **Act**ing（推理 + 行动）

这是目前最主流的 Agent 设计模式，由 Yao et al. 2022 提出。

### 核心思想

Agent 在每一步都做两件事：
1. **Reasoning（推理）**：分析当前状态，决定下一步做什么
2. **Acting（行动）**：执行具体的动作（调用工具）

### ReAct 的工作流程

```
输入：用户的问题

第1轮：
  Thought: 我需要先查询今天的天气
  Action: call_weather_api(city="北京")
  Observation: 晴天，25°C，湿度40%

第2轮：
  Thought: 已经知道天气了，再查一下是否有相关新闻
  Action: call_search_engine(query="北京今日新闻")
  Observation: 北京今日举办科技博览会...

第3轮：
  Thought: 我已经有足够信息了，可以回答用户
  Answer: 北京今天天气晴朗，温度25度...
```

### 代码示例：手写 ReAct 循环

```python
import json

# 定义工具
tools = {
    "get_weather": {
        "description": "获取指定城市的天气",
        "parameters": {"city": "string"},
        "func": lambda city: f"{city}：晴天，25°C"
    },
    "search": {
        "description": "搜索互联网信息",
        "parameters": {"query": "string"},
        "func": lambda query: f"搜索结果：关于'{query}'的最新信息..."
    },
    "calculator": {
        "description": "数学计算",
        "parameters": {"expression": "string"},
        "func": lambda expr: str(eval(expr))
    }
}

# ReAct Prompt 模板
REACT_PROMPT = """你是一个 AI Agent，使用 ReAct 模式工作。

可用工具：
{tools_description}

工作方式：
1. Thought: 分析当前情况，思考下一步
2. Action: 选择一个工具调用（JSON格式）
3. Observation: 你会收到工具的返回结果
4. 重复以上步骤，直到你能给出最终回答
5. Answer: 给出最终回答

历史记录：
{history}

用户问题：{question}

请开始你的推理过程。"""

def run_react_agent(question, max_steps=5):
    history = ""

    for step in range(max_steps):
        # 1. Agent 思考并决定行动
        response = llm.chat(REACT_PROMPT.format(
            tools_description=format_tools(tools),
            history=history,
            question=question
        ))

        # 2. 解析 Agent 的行动
        parsed = parse_response(response)

        if parsed["type"] == "answer":
            # Agent 认为可以回答了
            return parsed["content"]

        if parsed["type"] == "action":
            # Agent 要调用工具
            tool_name = parsed["tool"]
            tool_args = parsed["args"]

            # 3. 执行工具
            result = tools[tool_name]["func"](**tool_args)

            # 4. 记录这一轮
            history += f"\nThought: {parsed['thought']}"
            history += f"\nAction: {tool_name}({tool_args})"
            history += f"\nObservation: {result}\n"

    return "达到最大步骤数，任务未完成"
```

### 关键代码解读

```python
# 核心就三步，循环执行：

while not done:
    thought = llm.think(current_state)   # 思考
    action = llm.decide_action(thought)   # 决定行动
    observation = execute(action)          # 执行并观察
    # observation 反馈给下一轮思考
```

这就是 Agent 的全部秘密——**一个循环**。

---

## ReAct 的重要细节

### 1. 为什么 Thought 很重要

没有 Thought（直接 Action）：
```
Action: call_weather("北京")
Observation: 晴天
Action: call_search("北京新闻")   ← 为什么搜？不知道
```

有 Thought：
```
Thought: 用户想了解北京今天的情况，先查天气
Action: call_weather("北京")
Observation: 晴天，25°C
Thought: 天气不错，再查一下有什么活动
Action: call_search("北京活动")
```

**Thought 让 AI 的决策过程可解释**，也方便调试。

### 2. 终止条件

Agent 什么时候停下来？通常有三种方式：

```
1. AI 自己判断：生成 "Answer: ..." 表示完成
2. 达到最大步数：防止无限循环
3. 超时：防止执行太久
```

### 3. 工具选择

Agent 不是随机选工具，而是根据：
- 工具的描述（description）
- 当前需要什么信息
- 历史已获取的信息

这是通过 Prompt 实现的——你在工具描述里写得越清楚，AI 选择越准确。

---

## ReAct vs 其他 Agent 模式

| 模式 | 思路 | 适用场景 |
|------|------|----------|
| **ReAct** | 边思考边行动 | 通用、最常用 |
| Plan-then-Execute | 先制定完整计划再执行 | 复杂多步任务 |
| Reflexion | 执行后自我评估改进 | 需要高质量输出 |
| Multi-Agent | 多个 Agent 协作 | 大型复杂任务 |

---

## 实际应用场景

```
1. 研究助手：搜索资料 → 分析 → 总结报告
2. 编程助手：理解需求 → 查文档 → 写代码 → 测试
3. 客服系统：理解问题 → 查知识库 → 查订单 → 回答
4. 数据分析：理解需求 → 获取数据 → 计算 → 可视化
```

---

## 常见问题

### Q：Agent 和 Function Calling 有什么区别？

Function Calling 是 Agent 的一个**组件**：
- Function Calling = 定义和调用工具的能力
- Agent = 使用 Function Calling + 循环 + 自主决策的完整系统

```
Function Calling：一步调用
  用户问天气 → AI 调天气工具 → 返回结果

Agent：多步自主
  用户问"北京今天适合出门吗"
  → AI 想了一下，决定查天气
  → 发现天气不错
  → 又查了一下空气质量
  → 综合判断：适合出门
```

### Q：Agent 为什么会失控？

```
常见失控场景：
1. 无限循环：Agent 一直在思考，不停下来
2. 工具调用链爆炸：A调B，B调C，C又调A
3. 偏离目标：做着做着就跑题了

解决方案：
1. 设置最大步数限制
2. 设置超时
3. 在 Prompt 中明确任务范围
4. 加入人工审核环节
```

---

## 学完本节你应该能回答

```
1. Agent 和普通 LLM 调用的本质区别是什么？
2. ReAct 模式的三个核心步骤是什么？
3. Agent 的终止条件有哪些？
4. 为什么 Agent 需要 Thought 步骤？
5. 如何防止 Agent 失控？
```

---

## 下一节

[02-Planner-Executor 与 Agent Memory](./02-Planner-Executor与AgentMemory.md) →
