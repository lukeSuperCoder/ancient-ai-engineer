# Structured Output 与 Schema Validation

## 文档目标

这份文档讲第二阶段的另一条主线：

> 如何让模型输出稳定、可校验、可被程序继续处理的数据。

学完后，你应该能理解：

- Structured Output 是什么
- JSON Mode 解决什么问题
- Schema Validation 解决什么问题
- Output Parser 负责什么
- 为什么结构化输出是 AI 应用工程的基础能力

---

## 1. 什么是 Structured Output

Structured Output 指让模型输出符合固定结构的数据，而不是随意的自然语言。

自然语言输出适合直接展示给用户：

```text
明天北京天气晴，气温 18 到 27 度，适合出行。
```

结构化输出适合给程序使用：

```json
{
  "city": "北京",
  "date": "明天",
  "weather": "晴",
  "temperatureMin": 18,
  "temperatureMax": 27,
  "suitableForTravel": true
}
```

AI 应用里大量场景都需要结构化输出：

- 表单自动填写
- 简历信息抽取
- 工单分类
- 内容审核
- 数据分析
- 工具参数生成
- 多步骤工作流状态流转

---

## 2. 为什么 Structured Output 很重要

因为程序需要确定性。

如果模型输出：

```text
我认为这个用户的问题大概属于退款咨询。
```

程序很难稳定判断分类结果。

如果输出：

```json
{
  "category": "refund",
  "confidence": 0.86
}
```

程序就可以继续执行：

- 路由到退款流程
- 展示置信度
- 低置信度时转人工
- 记录结构化日志

AI 产品从 Demo 走向工程化，关键就是减少“靠人读”的自然语言中间态。

---

## 3. JSON Mode

JSON Mode 的目标是让模型输出合法 JSON。

它解决的是：

> 输出是不是 JSON。

例如你希望模型不要输出：

```text
好的，下面是 JSON：
{
  "name": "张三"
}
```

而是直接输出：

```json
{
  "name": "张三"
}
```

JSON Mode 的价值：

- 减少解析失败
- 避免 Markdown 代码块包裹
- 避免自然语言前后缀
- 方便直接 `JSON.parse`

但 JSON Mode 不等于 Schema Validation。

---

## 4. JSON Mode 的局限

合法 JSON 不代表符合业务结构。

例如你需要：

```json
{
  "category": "refund",
  "priority": "high"
}
```

模型可能输出合法 JSON：

```json
{
  "type": "退款",
  "level": 3
}
```

这仍然是 JSON，但字段名和类型都不符合你的程序要求。

所以 JSON Mode 只能保证语法层面，不能保证业务结构层面。

---

## 5. Schema Validation

Schema Validation 的目标是校验输出是否符合预期结构。

它解决的是：

> JSON 内容是不是你要的数据结构。

你可以用 JSON Schema、Zod、Valibot、Yup 等方式定义结构。

TypeScript 项目里常用 Zod：

```ts
import { z } from "zod";

const TicketSchema = z.object({
  category: z.enum(["refund", "delivery", "account", "other"]),
  priority: z.enum(["low", "medium", "high"]),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

type Ticket = z.infer<typeof TicketSchema>;
```

校验模型输出：

```ts
const parsedJson = JSON.parse(modelOutput);
const ticket = TicketSchema.parse(parsedJson);
```

如果字段缺失、类型错误、枚举值不合法，校验会失败。

---

## 6. Output Parser

Output Parser 是输出解析器。

它通常负责：

- 提取模型输出
- 解析 JSON
- 校验 Schema
- 转换成业务类型
- 处理解析失败

示例：

```ts
function parseStructuredOutput<T>(
  rawText: string,
  schema: { parse: (value: unknown) => T }
): T {
  let json: unknown;

  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error("Model output is not valid JSON");
  }

  return schema.parse(json);
}
```

实际工程里，Output Parser 应该返回标准化结果，而不是直接抛给上层：

```ts
type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; raw: string };
```

---

## 7. 结构化输出常见设计模式

### 7.1 分类任务

适合客服、工单、内容审核。

```ts
const ClassificationSchema = z.object({
  category: z.enum(["refund", "delivery", "account", "other"]),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});
```

---

### 7.2 信息抽取任务

适合简历解析、合同解析、发票解析。

```ts
const ResumeSchema = z.object({
  name: z.string().nullable(),
  email: z.string().email().nullable(),
  skills: z.array(z.string()),
  yearsOfExperience: z.number().nullable()
});
```

---

### 7.3 决策任务

适合工作流路由、自动审批、Agent 下一步动作。

```ts
const DecisionSchema = z.object({
  action: z.enum(["answer", "call_tool", "ask_clarification"]),
  toolName: z.string().nullable(),
  reason: z.string()
});
```

---

### 7.4 前端渲染任务

适合让模型生成 UI 可直接展示的数据。

```ts
const WeatherCardSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.string()
    })
  )
});
```

---

## 8. 和 Tool Calling 的关系

Tool Calling 和 Structured Output 很容易混淆。

可以这样区分：

| 能力 | 主要用途 | 输出给谁 |
|---|---|---|
| Tool Calling | 让模型决定调用哪个工具 | 应用层执行器 |
| Structured Output | 让模型按固定结构返回结果 | 前端或业务逻辑 |

Tool Calling 本身也依赖结构化参数。

例如模型调用天气工具时，需要输出：

```json
{
  "city": "北京",
  "date": "明天"
}
```

这就是一种结构化输出。

---

## 9. 解析失败怎么处理

结构化输出失败是常见情况，不应该让应用直接崩溃。

常见策略：

### 9.1 重试

当 JSON 解析失败或 Schema 校验失败时，可以把错误反馈给模型，让模型重新输出。

```text
你的输出不符合 Schema。字段 priority 必须是 low、medium、high 之一。请只返回修正后的 JSON。
```

---

### 9.2 降级

如果结构化输出失败，可以返回普通自然语言回答，或者转人工处理。

---

### 9.3 记录原始输出

必须记录：

- raw output
- parse error
- prompt version
- model name
- request id

这样才能定位是 Prompt 问题、模型问题还是业务 Schema 设计问题。

---

## 10. 工程最佳实践

### 10.1 Schema 尽量小

不要一次要求模型输出过大的嵌套结构。

结构越复杂，失败率越高，调试越困难。

---

### 10.2 枚举值用英文稳定标识

不推荐：

```json
{
  "priority": "高"
}
```

推荐：

```json
{
  "priority": "high"
}
```

展示给用户时再映射成中文。

---

### 10.3 对可为空字段显式建模

不要让模型猜字段是否存在。

推荐：

```ts
email: z.string().email().nullable()
```

比下面这种更容易处理：

```ts
email: z.string().optional()
```

对于抽取任务，`null` 通常比字段缺失更清楚。

---

### 10.4 不要信任模型输出

模型输出必须当作外部输入处理。

需要：

- 校验类型
- 校验枚举
- 校验长度
- 校验权限
- 过滤危险内容
- 避免直接拼 SQL 或命令

---

## 11. 学完后的检查标准

你应该能回答：

- Structured Output 和普通自然语言回答有什么区别？
- JSON Mode 能保证什么，不能保证什么？
- Schema Validation 为什么不能省？
- Output Parser 应该做哪些事？
- 结构化输出失败时怎么处理？

你也应该能独立写出：

- 一个 Zod Schema
- 一个 JSON 解析器
- 一个 Schema 校验流程
- 一个解析失败重试策略

