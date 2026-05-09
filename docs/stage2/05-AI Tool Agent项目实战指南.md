# AI Tool Agent 项目实战指南

## 文档目标

这份文档把第二阶段知识落到一个项目：

> AI Tool Agent

项目目标是做一个能自动选择工具、执行工具、展示执行日志，并返回结构化结果的简单 Agent。

它不要求一开始就做成复杂框架，但要形成完整工程闭环。

---

## 1. 项目能力目标

完成后，项目应该支持：

- 用户输入自然语言问题
- 模型自动判断是否需要工具
- 注册多个工具
- 执行工具调用
- 展示工具调用日志
- 返回自然语言回答
- 返回结构化执行结果
- 处理工具错误

建议工具：

- 天气工具
- 时间工具
- 汇率工具
- 新闻工具

---

## 2. 推荐技术栈

如果沿用前端工程习惯，可以使用：

```text
Frontend:
  React / Next.js
  Tailwind CSS 或现有 UI 组件库

Backend:
  Next.js Route Handler / Node.js

Validation:
  Zod

Model API:
  任意支持 Tool Calling 的模型服务
```

如果只是学习原理，也可以先做命令行版本：

```text
Node.js + TypeScript + Zod
```

建议顺序：

1. 先做 CLI 版本跑通逻辑
2. 再加 Web UI 展示对话和执行日志

---

## 3. 项目模块拆分

推荐目录结构：

```text
src/
  agent/
    runAgent.ts
    types.ts
  tools/
    registry.ts
    executor.ts
    weather.ts
    time.ts
    currency.ts
    news.ts
  model/
    callModel.ts
  validation/
    parseStructuredOutput.ts
  app/
    page.tsx
    api/agent/route.ts
```

每个模块职责要清晰。

---

## 4. 核心类型设计

### 4.1 ToolDefinition

```ts
export type ToolDefinition<TArgs, TResult> = {
  name: string;
  description: string;
  parameters: object;
  execute: (args: TArgs) => Promise<TResult>;
};
```

这个类型把工具的“说明”和“执行”绑定在一起。

---

### 4.2 ToolCall

```ts
export type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};
```

`arguments` 必须先当作 `unknown`，因为它来自模型，不能直接信任。

---

### 4.3 ToolResult

```ts
export type ToolResult =
  | {
      ok: true;
      tool: string;
      data: unknown;
    }
  | {
      ok: false;
      tool?: string;
      error: string;
      retryable: boolean;
    };
```

统一结果结构方便 Agent 判断后续动作。

---

### 4.4 AgentStep

```ts
export type AgentStep = {
  id: string;
  index: number;
  type: "model" | "tool";
  name?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs: number;
};
```

前端执行日志直接使用这个结构渲染。

---

## 5. 工具注册表实现

```ts
const tools = new Map<string, ToolDefinition<any, any>>();

export function registerTool(tool: ToolDefinition<any, any>) {
  tools.set(tool.name, tool);
}

export function getTool(name: string) {
  return tools.get(name);
}

export function getToolSchemas() {
  return Array.from(tools.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}
```

这样模型只看到工具 Schema，不直接接触工具执行函数。

---

## 6. 四个工具实现建议

### 6.1 天气工具

学习阶段可以先 mock：

```ts
export const weatherTool = {
  name: "get_weather",
  description: "当用户要查询城市天气、温度、降雨、风力时使用。",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "城市名称" },
      date: { type: "string", description: "日期，例如 今天、明天" }
    },
    required: ["city", "date"],
    additionalProperties: false
  },
  async execute(args: { city: string; date: string }) {
    return {
      city: args.city,
      date: args.date,
      weather: "晴",
      temperatureMin: 18,
      temperatureMax: 27,
      rainProbability: 0.1
    };
  }
};
```

---

### 6.2 时间工具

```ts
export const timeTool = {
  name: "get_current_time",
  description: "当用户要查询某个城市或时区的当前日期时间时使用。",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA 时区，例如 Asia/Shanghai、America/New_York"
      }
    },
    required: ["timezone"],
    additionalProperties: false
  },
  async execute(args: { timezone: string }) {
    return {
      timezone: args.timezone,
      currentTime: new Date().toLocaleString("zh-CN", {
        timeZone: args.timezone
      })
    };
  }
};
```

---

### 6.3 汇率工具

```ts
export const currencyTool = {
  name: "convert_currency",
  description: "当用户需要换算不同货币金额时使用。",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "原始金额" },
      fromCurrency: { type: "string", description: "原始货币代码，例如 USD" },
      toCurrency: { type: "string", description: "目标货币代码，例如 CNY" }
    },
    required: ["amount", "fromCurrency", "toCurrency"],
    additionalProperties: false
  },
  async execute(args: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
  }) {
    const mockRate = 7.2;

    return {
      amount: args.amount,
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      rate: mockRate,
      convertedAmount: args.amount * mockRate
    };
  }
};
```

真实项目应接入汇率 API，并返回更新时间。

---

### 6.4 新闻工具

```ts
export const newsTool = {
  name: "search_news",
  description: "当用户需要搜索某个主题的近期新闻或动态时使用。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "新闻搜索关键词" },
      limit: { type: "number", description: "返回数量，默认 5" }
    },
    required: ["query"],
    additionalProperties: false
  },
  async execute(args: { query: string; limit?: number }) {
    const limit = args.limit ?? 5;

    return {
      query: args.query,
      articles: Array.from({ length: limit }).map((_, index) => ({
        title: `${args.query} 相关新闻 ${index + 1}`,
        summary: "这是学习阶段的 mock 新闻摘要。",
        source: "Mock News",
        publishedAt: new Date().toISOString()
      }))
    };
  }
};
```

新闻是强实时数据。学习阶段可以 mock，作品集版本建议接真实搜索或新闻 API。

---

## 7. Tool Executor 实现

```ts
export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const tool = getTool(toolCall.name);

  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool: ${toolCall.name}`,
      retryable: false
    };
  }

  try {
    const data = await tool.execute(toolCall.arguments);

    return {
      ok: true,
      tool: tool.name,
      data
    };
  } catch (error) {
    return {
      ok: false,
      tool: tool.name,
      error: error instanceof Error ? error.message : String(error),
      retryable: true
    };
  }
}
```

进阶版本要加入 Zod 校验：

```ts
const args = tool.argsSchema.parse(toolCall.arguments);
const data = await tool.execute(args);
```

---

## 8. Agent API 返回结构

后端接口建议返回：

```ts
type AgentResponse = {
  answer: string;
  structured?: unknown;
  steps: AgentStep[];
};
```

前端可以同时展示：

- 最终回答
- 工具执行过程
- 结构化 JSON

这比只做聊天 UI 更能体现第二阶段学习成果。

---

## 9. 前端页面建议

页面可以分成三栏或上下两块：

```text
左侧 / 上方：
  对话区
  输入框

右侧 / 下方：
  执行日志
  Tool Call 输入参数
  Tool Result
  Structured Output
```

不要只做一个普通聊天框。第二阶段项目的重点是把工具调用过程展示出来。

---

## 10. 推荐测试问题

用这些问题验证工具路由：

```text
明天北京天气怎么样？
纽约现在几点？
100 美元换算成人民币是多少？
帮我查一下最近 AI Agent 的新闻。
如果明天上海不下雨，帮我查一下上海周末活动相关新闻。
```

观察：

- 模型有没有选对工具
- 参数是否正确
- 工具结果是否加入上下文
- 最终回答是否引用了工具结果
- 执行日志是否完整

---

## 11. README 可以怎么写

作品集项目 README 建议包含：

```text
# AI Tool Agent

## 项目简介
一个支持多工具调用、结构化输出和执行日志的 AI Agent 示例项目。

## 核心能力
- Tool Calling
- Tool Registry
- Tool Executor
- Structured Output
- Execution Trace
- Tool Error Handling

## 支持工具
- Weather
- Time
- Currency
- News

## 技术栈
- Next.js / React
- TypeScript
- Zod
- LLM API

## 架构说明
用户输入 -> 模型决策 -> 工具调用 -> 工具结果 -> 最终回答

## 本地运行
...

## 学习总结
...
```

---

## 12. 完成标准

基础完成：

- 能注册 4 个工具
- 模型能自动选择工具
- 工具能返回结果
- 最终回答能结合工具结果
- 前端能展示执行日志

进阶完成：

- 工具参数使用 Zod 校验
- 工具错误有统一格式
- 支持结构化输出
- 支持最大步数限制
- 支持工具调用耗时统计
- README 写清楚架构和学习收获

---

## 13. 面试讲法

你可以这样介绍项目：

```text
这个项目实现了一个简单 AI Tool Agent。

用户输入问题后，后端会把可用工具的 schema 提供给模型。
模型根据用户意图生成 tool call，应用层根据 tool name 从 registry
中找到对应工具，校验参数后执行。工具结果会作为 tool message
重新加入上下文，模型再基于真实结果生成最终回答。

项目里我实现了天气、时间、汇率、新闻四类工具，并记录每一步
model call 和 tool call 的执行日志，方便调试模型为什么选择某个工具。
同时我使用 schema validation 处理模型参数不稳定的问题，并设置
maxSteps 防止 Agent 无限循环。
```

这段话能覆盖第二阶段大部分面试点。

