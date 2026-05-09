# Tool Calling 原理与工具设计

## 文档目标

这份文档讲清楚第二阶段最重要的能力：

> 如何让 AI 调用外部工具。

学完后，你应该能理解：

- Function Calling / Tool Calling 是什么
- 模型为什么能选择工具
- JSON Schema 在工具调用中起什么作用
- Tool Schema 应该怎么设计
- Tool Registry 和 Tool Executor 分别负责什么
- 如何处理工具调用失败

---

## 1. Tool Calling 是什么

Tool Calling 是一种让模型和外部系统协作的机制。

模型本身只会生成文本或结构化内容。它不能真正访问互联网、数据库、本地文件、公司业务接口。Tool Calling 的作用是让开发者把外部能力包装成工具，然后把工具说明交给模型。

模型根据用户问题决定：

- 是否需要调用工具
- 调用哪个工具
- 传入什么参数

应用程序再根据模型给出的 tool call 执行真实函数。

---

## 2. 一张图理解工具调用流程

```text
用户：明天北京天气怎么样？
  ↓
应用把用户消息 + 工具列表发给模型
  ↓
模型决定调用 get_weather
  ↓
模型返回：
{
  "tool": "get_weather",
  "arguments": {
    "city": "北京",
    "date": "明天"
  }
}
  ↓
应用校验参数
  ↓
应用执行 get_weather(city, date)
  ↓
应用把工具结果发回模型
  ↓
模型生成自然语言回答
```

关键点：

> 模型负责选择工具和生成参数，应用负责真正执行工具。

---

## 3. Function Calling 和 Tool Calling 的关系

很多资料会同时出现两个词：

- Function Calling
- Tool Calling

可以这样理解：

- Function Calling 更强调“模型调用函数”的能力
- Tool Calling 更强调“模型调用外部工具”的抽象

在 AI 应用开发里，工具可以是一个函数，也可以是一个 API、数据库查询、脚本、搜索服务、文件读写能力。

所以工程上更推荐用 Tool Calling 这个更宽的概念。

---

## 4. 为什么不能只靠 Prompt

不用 Tool Calling，也可以在 Prompt 里写：

```text
如果用户问天气，请按 JSON 格式输出城市和日期。
```

但这种方式不稳定：

- 模型可能不按格式输出
- 参数类型可能错
- 字段可能缺失
- 调用哪个工具需要你自己用字符串判断
- 错误处理困难

Tool Calling 的优势是：

- 工具有明确名字
- 参数有明确 Schema
- 模型输出更接近程序可消费的结构
- 应用层可以做统一校验和执行
- 多工具场景更容易扩展

---

## 5. JSON Schema 是什么

JSON Schema 是一种描述 JSON 数据结构的标准方式。

它可以描述：

- 对象有哪些字段
- 字段是什么类型
- 哪些字段必填
- 字段允许哪些枚举值
- 字段的含义是什么

例如一个天气工具的参数：

```json
{
  "type": "object",
  "properties": {
    "city": {
      "type": "string",
      "description": "要查询天气的城市名称，例如 北京、上海、深圳"
    },
    "date": {
      "type": "string",
      "description": "要查询的日期，例如 今天、明天、2026-05-08"
    }
  },
  "required": ["city", "date"],
  "additionalProperties": false
}
```

这个 Schema 告诉模型：

- 工具需要 `city`
- 工具需要 `date`
- 两个字段都是字符串
- 不要随便加其他字段

---

## 6. Tool Schema 怎么设计

一个工具通常需要这些信息：

```ts
type ToolSchema = {
  name: string;
  description: string;
  parameters: JSONSchema;
};
```

示例：

```ts
const getWeatherTool = {
  name: "get_weather",
  description: "查询指定城市在指定日期的天气信息",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "城市名称，例如 北京、上海、深圳"
      },
      date: {
        type: "string",
        description: "日期，例如 今天、明天、2026-05-08"
      }
    },
    required: ["city", "date"],
    additionalProperties: false
  }
};
```

---

## 7. 好的 Tool Schema 有什么特点

### 7.1 工具名清晰

工具名应该使用动作 + 对象：

```text
get_weather
get_current_time
convert_currency
search_news
```

不要使用过于模糊的名字：

```text
tool1
query
handle
process
```

模型会根据工具名和 description 判断何时使用工具。名字越清楚，选择越稳定。

---

### 7.2 description 写使用场景

不好的 description：

```text
天气工具
```

更好的 description：

```text
当用户想查询某个城市某一天的天气、温度、降雨或风力信息时使用。
```

description 要回答：

- 这个工具能做什么
- 什么时候应该用
- 什么时候不应该用

---

### 7.3 参数不要设计得太宽

不推荐：

```json
{
  "query": {
    "type": "string"
  }
}
```

这种设计把解析压力都丢给工具函数，模型也不清楚该怎么组织参数。

更推荐：

```json
{
  "city": {
    "type": "string"
  },
  "date": {
    "type": "string"
  }
}
```

参数越结构化，后续校验、日志、调试越容易。

---

## 8. Tool Registry

Tool Registry 是工具注册表。

它负责维护：

- 有哪些工具
- 每个工具的 Schema
- 每个工具对应的执行函数

示例：

```ts
type ToolDefinition<TArgs, TResult> = {
  name: string;
  description: string;
  parameters: object;
  execute: (args: TArgs) => Promise<TResult>;
};

const toolRegistry = new Map<string, ToolDefinition<any, any>>();

function registerTool(tool: ToolDefinition<any, any>) {
  toolRegistry.set(tool.name, tool);
}

function getTool(name: string) {
  return toolRegistry.get(name);
}
```

这样新增工具时，不需要改 Agent 主循环，只需要注册一个新工具。

---

## 9. Tool Executor

Tool Executor 是工具执行器。

它负责：

- 根据 tool name 找到工具
- 校验 arguments
- 执行工具函数
- 捕获错误
- 记录日志
- 返回标准化结果

示例：

```ts
async function executeToolCall(toolCall: {
  name: string;
  arguments: unknown;
}) {
  const tool = getTool(toolCall.name);

  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool: ${toolCall.name}`
    };
  }

  try {
    const result = await tool.execute(toolCall.arguments);

    return {
      ok: true,
      tool: toolCall.name,
      result
    };
  } catch (error) {
    return {
      ok: false,
      tool: toolCall.name,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
```

实际项目里还应该加入 Schema Validation，这部分在下一篇文档讲。

---

## 10. 工具错误处理

工具调用常见错误：

- 模型选错工具
- 参数缺失
- 参数类型错误
- 外部 API 超时
- 外部 API 返回异常
- 数据库查询失败
- 权限不足

推荐统一返回结构：

```ts
type ToolResult =
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

这样 Agent 可以根据错误决定：

- 让模型重新生成参数
- 换一个工具
- 告诉用户失败原因
- 终止流程

---

## 11. 四个基础工具怎么设计

### 11.1 天气工具

```text
name: get_weather
作用：查询城市天气
参数：city, date
返回：天气、最低温、最高温、风力、降雨概率
```

适合问题：

- 明天北京天气怎么样？
- 上海今天会下雨吗？
- 周末去杭州需要带伞吗？

---

### 11.2 时间工具

```text
name: get_current_time
作用：查询指定时区或城市的当前时间
参数：timezone 或 city
返回：当前日期、时间、时区
```

适合问题：

- 纽约现在几点？
- 北京当前日期是什么？
- 东京和上海差几个小时？

---

### 11.3 汇率工具

```text
name: convert_currency
作用：换算两种货币金额
参数：amount, fromCurrency, toCurrency
返回：汇率、换算后金额、更新时间
```

适合问题：

- 100 美元等于多少人民币？
- 3000 日元换算成美元是多少？

---

### 11.4 新闻工具

```text
name: search_news
作用：搜索指定关键词的近期新闻
参数：query, limit, language
返回：标题、摘要、来源、发布时间、链接
```

适合问题：

- 最近 AI Agent 有什么新闻？
- 帮我查一下 OpenAI 最新动态。

新闻、汇率、天气都属于实时数据，实际项目应接入真实 API 或明确使用 mock 数据。

---

## 12. 学完后的检查标准

你应该能回答：

- Tool Calling 的完整链路是什么？
- 模型和应用分别负责什么？
- 为什么要用 JSON Schema？
- Tool Schema 的 description 为什么重要？
- Tool Registry 解决什么问题？
- Tool Executor 为什么要统一错误格式？

你也应该能独立写出：

- 一个天气工具 Schema
- 一个工具注册表
- 一个工具执行器
- 一个标准化 ToolResult 类型

