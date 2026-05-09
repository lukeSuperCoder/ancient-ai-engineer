# Agent 工具调用循环

## 文档目标

这份文档讲第二阶段如何从 Tool Calling 过渡到简单 Agent。

学完后，你应该能理解：

- Agent 最小可运行形态是什么
- 工具调用循环怎么组织
- Message History 如何保存工具调用过程
- Tool Routing 是什么
- 执行日志应该记录什么
- 如何避免 Agent 无限循环

---

## 1. Agent 是什么

在应用工程里，不要把 Agent 理解得太玄。

一个最小 Agent 可以理解为：

> 能根据目标，决定是否调用工具，并根据工具结果继续完成任务的程序循环。

它通常包含：

- 模型
- 工具列表
- 工具执行器
- 状态
- 循环控制
- 最终输出

---

## 2. 最小 Agent Loop

最小循环如下：

```text
messages = [user message]

while step < maxSteps:
  response = callModel(messages, tools)

  if response has tool calls:
    for each tool call:
      result = executeTool(tool call)
      messages.append(tool result)
    continue

  return response final answer
```

这个循环就是很多复杂 Agent 框架的底层原型。

---

## 3. 为什么 Agent 需要循环

因为一次模型调用往往只能完成一个决策：

- 判断是否需要工具
- 生成工具参数
- 等待工具结果

工具结果回来后，模型才知道下一步该做什么。

例如用户问：

```text
如果北京明天天气适合出行，帮我再查一下相关新闻。
```

可能流程是：

```text
Step 1: 调 get_weather 查询北京明天天气
Step 2: 根据天气结果判断是否适合出行
Step 3: 如果适合，调 search_news 查询相关新闻
Step 4: 汇总最终回答
```

这不是单次 Prompt 能稳定完成的，必须有循环。

---

## 4. Message History 中要保存什么

Agent 的上下文不只包含用户和助手对话，还要包含工具调用过程。

典型消息序列：

```text
user:
  明天北京天气怎么样？

assistant:
  tool_call: get_weather({ city: "北京", date: "明天" })

tool:
  { weather: "晴", temperatureMin: 18, temperatureMax: 27 }

assistant:
  明天北京天气晴，18 到 27 度，适合出行。
```

模型需要看到工具结果，才能生成最终回答。

---

## 5. Tool Routing

Tool Routing 指模型或应用决定该调用哪个工具。

有两种常见方式：

### 5.1 模型自动路由

把所有工具 Schema 提供给模型，让模型自己选择。

优点：

- 开发简单
- 扩展方便
- 适合工具数量较少的场景

缺点：

- 工具很多时选择不稳定
- 可能调用不必要工具
- 成本较高

---

### 5.2 应用层预路由

应用先根据规则或分类模型筛选候选工具，再交给模型。

例如：

```text
用户问题包含“天气、下雨、温度” -> 只提供天气工具
用户问题包含“汇率、美元、人民币” -> 只提供汇率工具
```

优点：

- 更可控
- 降低工具选择错误率
- 降低上下文成本

缺点：

- 需要维护路由规则
- 规则可能漏召回

第二阶段项目建议先做模型自动路由，再补简单规则预路由。

---

## 6. Agent 状态

Agent 状态至少应该包含：

```ts
type AgentState = {
  messages: Message[];
  steps: AgentStep[];
  maxSteps: number;
  startedAt: number;
};
```

其中 `steps` 用于记录执行日志：

```ts
type AgentStep = {
  stepIndex: number;
  type: "model" | "tool";
  name?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: number;
  endedAt: number;
};
```

执行日志是 Agent 项目非常重要的工程能力。没有日志，就很难调试模型为什么选错工具、参数为什么错、外部 API 为什么失败。

---

## 7. TypeScript 伪代码

下面是一个最小 Agent 执行流程：

```ts
async function runAgent(input: string) {
  const state: AgentState = {
    messages: [{ role: "user", content: input }],
    steps: [],
    maxSteps: 5,
    startedAt: Date.now()
  };

  for (let stepIndex = 0; stepIndex < state.maxSteps; stepIndex++) {
    const modelStartedAt = Date.now();
    const response = await callModel({
      messages: state.messages,
      tools: getToolSchemas()
    });

    state.steps.push({
      stepIndex,
      type: "model",
      output: response,
      startedAt: modelStartedAt,
      endedAt: Date.now()
    });

    if (!response.toolCalls?.length) {
      return {
        answer: response.content,
        steps: state.steps
      };
    }

    for (const toolCall of response.toolCalls) {
      const toolStartedAt = Date.now();
      const toolResult = await executeToolCall(toolCall);

      state.steps.push({
        stepIndex,
        type: "tool",
        name: toolCall.name,
        input: toolCall.arguments,
        output: toolResult,
        error: toolResult.ok ? undefined : toolResult.error,
        startedAt: toolStartedAt,
        endedAt: Date.now()
      });

      state.messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  return {
    answer: "任务执行步数过多，已停止。请缩小问题范围后重试。",
    steps: state.steps
  };
}
```

---

## 8. 防止无限循环

Agent 容易出现循环调用：

- 一直调用同一个工具
- 工具失败后不断重试
- 模型没有形成最终回答
- 工具结果不够明确

必须设置：

- `maxSteps`
- 单工具超时时间
- 最大重试次数
- 最大总耗时
- 最大工具调用次数

示例：

```ts
const limits = {
  maxSteps: 5,
  maxToolCalls: 8,
  maxRetriesPerTool: 2,
  timeoutMs: 30000
};
```

---

## 9. 执行日志应该展示什么

AI Tool Agent 项目的前端可以展示执行日志：

```text
Step 1: Model
  判断需要调用 get_weather

Step 2: Tool get_weather
  input: { city: "北京", date: "明天" }
  output: { weather: "晴", temperatureMin: 18, temperatureMax: 27 }

Step 3: Model
  生成最终回答
```

建议日志字段：

- step index
- step type
- tool name
- input
- output
- error
- duration
- timestamp

这对学习和面试都很有价值，因为它能展示你理解 Agent 不是一次性问答，而是可观测的执行流程。

---

## 10. Agent 和普通聊天机器人的区别

| 能力 | 普通聊天机器人 | Tool Agent |
|---|---|---|
| 回答来源 | 模型已有知识和上下文 | 模型 + 外部工具 |
| 实时数据 | 不可靠 | 可以通过工具获取 |
| 业务操作 | 很弱 | 可以调用接口执行 |
| 输出稳定性 | 偏自然语言 | 可结构化 |
| 可观测性 | 主要看对话 | 可看工具执行日志 |

---

## 11. 学完后的检查标准

你应该能回答：

- Agent Loop 的基本流程是什么？
- 为什么工具结果要重新加入 messages？
- Tool Routing 有哪些方式？
- 为什么必须设置 maxSteps？
- 执行日志应该记录哪些内容？

你也应该能独立实现：

- 一个 `runAgent` 主循环
- 一个 `AgentState`
- 一个执行日志结构
- 一个最大步数保护
- 一个工具失败后的标准化响应

