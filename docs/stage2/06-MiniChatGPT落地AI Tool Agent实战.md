# Mini ChatGPT 落地 AI Tool Agent 实战

## 文档目标

这篇文档记录本次如何把 `docs/stage2/05-AI Tool Agent项目实战指南.md` 中的项目要求，真正落地到 `stage1/chatgpt` 这个 Mini ChatGPT 项目里。

学完后，你应该能理解：

- 普通 Chat 和 Tool Agent 的区别
- Tool Calling 在后端如何形成 Agent 循环
- 工具注册表、工具执行器、参数校验分别解决什么问题
- 如何接入真实工具 API
- 如何把 Agent 执行过程通过 SSE 流式展示到前端
- 为什么前端要同时展示最终回答、Thinking 过程、Tool Step 和 Structured Output

---

## 1. 本次实现了什么

原来的 `stage1/chatgpt` 是一个普通聊天应用：

```text
用户输入 -> 后端调用模型 -> 模型流式返回文本 -> 前端显示回答
```

这次新增了 Agent 模式：

```text
用户输入
  -> 模型判断是否需要工具
  -> 后端执行工具
  -> 工具结果回填给模型
  -> 模型继续判断或生成最终回答
  -> 前端实时展示执行过程和最终回答
```

最终项目支持两种模式：

- `Chat`：普通对话，继续使用 `/api/chat/stream`
- `Agent`：工具增强对话，使用 `/api/agent/stream`

Agent 模式不是只多了几个 API，而是多了一套完整的工程闭环：

- 工具定义
- 工具注册
- 工具参数校验
- 工具执行
- Agent 循环
- 最大步骤限制
- 执行日志
- Thinking 过程展示
- 结构化结果输出
- 前端流式更新

---

## 2. 目录结构变化

本次主要新增了后端 Agent 模块和前端执行日志组件。

```text
stage1/chatgpt/
  server/
    agent/
      types.ts        # Agent、Tool、Step、Stream Event 类型
      registry.ts     # 工具注册表
      executor.ts     # 工具执行器
      runAgent.ts     # Agent 主循环与流式 Agent
    tools/
      http.ts         # 外部 API JSON 请求工具
      weather.ts      # 和风天气工具
      time.ts         # 当前时间工具
      news.ts         # 智谱 Web Search 工具
    config.ts         # 模型与工具 API 配置
    index.ts          # Express API 路由

  src/
    components/
      AgentTracePanel.vue  # Agent Thinking 与执行日志面板
    composables/
      useChat.ts           # Chat/Agent 两种发送流程
    types/
      chat.ts              # 前端消息、Agent Step、Thinking 类型
```

这个拆分的核心原则是：

> 模型只负责“决定调用什么工具”，应用层负责“注册工具、校验参数、执行工具、记录过程”。

---

## 3. 核心类型设计

### 3.1 ToolDefinition

工具定义把三件事放在一起：

- 给模型看的工具说明
- 给模型看的 JSON Schema
- 应用层真正执行的函数

简化后可以理解为：

```ts
export type ToolDefinition<TArgs, TResult> = {
  name: string;
  description: string;
  inputSchema: object;
  argsSchema: z.ZodType<TArgs>;
  execute: (args: TArgs) => Promise<TResult>;
};
```

这里有两个 schema：

- `inputSchema`：传给模型，让模型知道应该怎么生成参数
- `argsSchema`：后端自己用 Zod 校验模型传回来的参数

为什么要分开？

因为模型输出的参数不能直接信任。即使模型看过 JSON Schema，也可能漏字段、字段类型错误、传多余字段。后端必须重新校验。

---

### 3.2 ToolResult

工具执行结果统一成成功和失败两种结构：

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

统一结果结构的好处是：

- 前端可以稳定展示工具成功或失败
- 模型可以看到工具失败原因，并继续生成解释
- Agent 循环不需要因为某个工具失败就直接崩溃

例如天气 API Key 配置错了，工具可以返回：

```json
{
  "ok": false,
  "tool": "get_weather",
  "error": "缺少 QWEATHER_API_TOKEN，无法调用和风天气 API。",
  "retryable": true
}
```

模型再基于这个结果告诉用户当前无法查询天气，而不是前端直接白屏。

---

### 3.3 AgentStep

`AgentStep` 是前端执行日志的核心数据：

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

每一次模型决策和每一次工具调用都会生成一个 Step。

例如：

```text
Step 1 · Model
模型判断需要调用 get_weather

Step 2 · Tool get_weather
输入：{ city: "北京" }
输出：{ text: "霾", tempC: "32" }

Step 3 · Model
模型根据天气结果生成最终回答
```

没有 `AgentStep`，就只能看到最终回答。  
有了 `AgentStep`，才能调试 Agent 为什么选这个工具、参数是什么、外部 API 返回了什么。

---

### 3.4 AgentThought

前端展示的 `Thinking` 不是模型私有推理链路，而是应用层生成的可见执行过程摘要：

```ts
export type AgentThought = {
  id: string;
  index: number;
  text: string;
  createdAt: number;
};
```

例如：

```text
1. 收到问题，开始判断是否需要调用外部工具。
2. 第 1 轮：请求模型选择下一步动作。
3. 准备调用工具：get_weather。
4. 工具 get_weather 已返回结果，准备交给模型整合。
5. 没有新的工具调用，开始输出最终回答。
```

这样用户能看到 Agent 正在做什么，但不会把模型内部不可见的推理链路直接暴露出来。

---

## 4. 工具注册表

工具注册表位于：

```text
server/agent/registry.ts
```

它做三件事：

```ts
registerTool(tool);
getTool(name);
getToolSchemas();
```

其中 `getToolSchemas()` 只返回模型需要看的内容：

```ts
{
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema
}
```

注意：模型不能直接拿到 `execute` 函数。

这是一条重要边界：

> 模型只能请求调用工具，真正执行工具的一定是应用层。

这样做有几个好处：

- API Key 不会暴露给模型或浏览器
- 工具调用可以统一校验
- 工具执行可以统一记录日志
- 可以限制模型只能调用注册过的工具

---

## 5. 工具执行器

工具执行器位于：

```text
server/agent/executor.ts
```

它的职责是：

1. 根据工具名从 registry 找工具
2. 用 Zod 校验参数
3. 调用工具的 `execute`
4. 把成功或失败包装成 `ToolResult`

核心流程：

```ts
const tool = getTool(toolCall.name);
const args = tool.argsSchema.parse(toolCall.arguments);
const data = await tool.execute(args);
return { ok: true, tool: tool.name, data };
```

如果参数校验失败，会返回统一错误：

```ts
{
  ok: false,
  tool: tool.name,
  error: "工具参数校验失败：...",
  retryable: false
}
```

这个设计体现了第二阶段很重要的工程思想：

> Tool Calling 不是让模型“直接操作世界”，而是让模型“请求应用层执行一个受控动作”。

---

## 6. 三个真实工具

本次没有继续使用文档里的 mock 工具，而是接入了真实 API。

### 6.1 和风天气工具

文件：

```text
server/tools/weather.ts
```

工具名：

```text
get_weather
```

调用流程：

```text
城市名 -> 和风城市搜索 -> locationId -> 和风实时天气 -> 天气结果
```

本项目使用的鉴权方式是：

```http
X-QW-Api-Key: <QWEATHER_API_TOKEN>
```

默认 Host：

```text
https://n95khw2yca.re.qweatherapi.com
```

为什么先查城市？

因为和风天气实时天气接口更适合用 Location ID 查询。用户输入的是“北京”“上海”这种自然语言城市名，所以需要先调用城市搜索接口拿到 ID。

返回结果包含：

- 城市
- 行政区
- 国家
- 时区
- 实时天气文本
- 温度
- 体感温度
- 风向
- 风力
- 湿度
- 降水量
- 气压
- 可见度
- 更新时间
- 数据来源链接

---

### 6.2 时间工具

文件：

```text
server/tools/time.ts
```

工具名：

```text
get_current_time
```

这个工具不调用外部 API，而是使用 Node 的 `Intl.DateTimeFormat`：

```ts
new Intl.DateTimeFormat("zh-CN", {
  timeZone: args.timezone,
  dateStyle: "full",
  timeStyle: "medium"
});
```

它要求模型传入 IANA 时区，例如：

```text
Asia/Shanghai
America/New_York
Europe/London
```

如果模型传了无效时区，工具会返回错误。

---

### 6.3 智谱 Web Search 工具

文件：

```text
server/tools/news.ts
```

工具名：

```text
search_news
```

这个工具用于新闻、政策、近期动态、实时信息检索。

调用接口：

```text
POST https://open.bigmodel.cn/api/paas/v4/web_search
```

鉴权方式：

```http
Authorization: Bearer <BIGMODEL_API_KEY>
```

默认请求参数：

```json
{
  "search_engine": "search_std",
  "search_intent": false,
  "count": 5,
  "search_recency_filter": "oneWeek",
  "content_size": "medium"
}
```

返回结果会整理成：

- 标题
- 摘要
- 链接
- 媒体来源
- 引用编号
- 发布时间

---

## 7. Agent 循环原理

核心代码位于：

```text
server/agent/runAgent.ts
```

普通聊天是一次模型调用：

```text
callModel(messages) -> answer
```

Agent 是一个循环：

```text
for round in maxSteps:
  response = callModel(messages, tools)

  if response has tool_use:
    result = executeTool(tool_use)
    messages.push(assistant tool_use)
    messages.push(user tool_result)
    continue

  return final answer
```

为什么工具结果要重新放回 `messages`？

因为模型第一次只负责提出工具调用请求。  
工具真正执行后，模型还不知道结果。  
必须把结果以 `tool_result` 的形式放回对话历史，让模型第二次看到真实数据，再生成最终回答。

Anthropic 兼容 Messages API 的消息顺序大致是：

```text
user:
  北京现在天气怎么样？

assistant:
  tool_use get_weather({ city: "北京" })

user:
  tool_result({ ok: true, data: ... })

assistant:
  北京当前天气为霾，温度 32°C...
```

这里第二条 `user` 不是用户手动发的，而是应用层代表工具结果发给模型。

---

## 8. 为什么要有 maxSteps

Agent 循环必须有最大步数限制。

否则可能出现：

- 模型反复调用同一个工具
- 工具失败后模型不断重试
- 模型一直生成新的工具调用，不给最终回答

本项目配置：

```env
AGENT_MAX_STEPS=4
```

后端每一轮都会检查是否超过最大步数。达到上限后，即使模型还没生成理想答案，也会结束并返回当前可用结果。

这是 Agent 工程里非常重要的安全阀。

---

## 9. Agent 流式输出

最开始实现的 `/api/agent` 是一次性返回：

```text
Agent 全部执行完 -> 返回 answer + steps + structured
```

后面升级成了流式接口：

```text
POST /api/agent/stream
```

它通过 SSE 逐步推送事件：

```text
thinking    可见过程摘要
step        模型步骤或工具步骤
delta       最终回答文本增量
structured 结构化结果
done        结束
error       错误
```

为什么 Agent 更需要流式？

因为 Agent 可能要先调模型、再调工具、再调模型。  
如果不流式，用户会一直等到所有步骤结束才看到结果。  
流式后，前端可以实时展示：

```text
正在判断是否需要工具...
准备调用工具 get_weather...
工具返回结果...
开始输出最终回答...
```

这样用户能理解系统正在运行，而不是以为页面卡住。

---

## 10. SSE 协议设计

后端每个事件都用固定格式写出：

```ts
response.write(`event: ${event}\n`);
response.write(`data: ${JSON.stringify(data)}\n\n`);
```

例如 Thinking 事件：

```text
event: thinking
data: {"type":"thinking","thought":{"index":1,"text":"收到问题，开始判断是否需要调用外部工具。"}}
```

工具步骤事件：

```text
event: step
data: {"type":"step","step":{"type":"tool","name":"get_weather","input":{"city":"北京"},"durationMs":421}}
```

最终回答增量：

```text
event: delta
data: {"type":"delta","text":"北京当前天气为"}
```

前端只需要按 `\n\n` 拆分事件，再根据 `event` 类型更新不同状态。

---

## 11. 前端状态如何更新

核心逻辑位于：

```text
src/composables/useChat.ts
```

普通 Chat 模式：

```text
sendMessage -> streamChatReply -> onDelta -> 更新 assistant.content
```

Agent 模式：

```text
sendMessage -> streamAgentReply
  thinking   -> 更新 assistant.agent.thoughts
  step       -> 更新 assistant.agent.steps
  delta      -> 追加 assistant.content
  structured -> 更新 assistant.agent.structured
```

也就是说，同一个 assistant 消息里同时保存：

```ts
{
  content: "最终回答文本",
  agent: {
    thoughts: [...],
    steps: [...],
    structured: {...}
  }
}
```

这样做的好处是：

- 对话历史和执行日志绑定在同一条回答上
- 刷新页面后可以从 localStorage 恢复
- 前端不需要维护另一个独立的日志 store

---

## 12. 为什么使用替换数组元素更新

Vue 响应式里，直接修改某个消息对象的深层属性，有时不如替换数组元素稳定。

所以项目里保留了之前的模式：

```ts
replaceMessageById(currentMessages, assistantMessage.id, patch)
```

每次收到流式事件，都构造新的消息对象替换旧对象。

例如收到一个 `delta`：

```ts
messages: replaceMessageById(currentMessages, assistantMessage.id, {
  content: currentContent + payload.text,
  agent: currentAgent
})
```

收到一个 `step`：

```ts
messages: replaceMessageById(currentMessages, assistantMessage.id, {
  agent: {
    ...currentAgent,
    steps: [...currentAgent.steps, payload.step]
  }
})
```

这比直接 `message.agent.steps.push(step)` 更容易保持视图稳定更新。

---

## 13. 前端展示设计

本次新增组件：

```text
src/components/AgentTracePanel.vue
```

桌面端右侧展示：

- Thinking
- Model Step
- Tool Step
- 输入参数
- 输出结果
- 错误信息
- Structured Output

移动端空间有限，所以把执行日志折叠在 assistant 消息气泡内。

这样既保留完整调试信息，又不会破坏原来的聊天布局。

---

## 14. Chat 模式和 Agent 模式的区别

### 14.1 Chat 模式

```text
前端 -> /api/chat/stream -> 模型流式文本 -> 前端显示
```

特点：

- 简单
- 快
- 适合普通问答
- 不能访问外部工具

---

### 14.2 Agent 模式

```text
前端 -> /api/agent/stream
  -> 模型选择工具
  -> 后端执行工具
  -> 工具结果回填模型
  -> 模型生成最终回答
  -> 前端显示 Thinking、Step、Answer、Structured Output
```

特点：

- 能查真实天气
- 能查实时新闻
- 能查询当前时间
- 有执行日志
- 有结构化输出
- 比普通 Chat 更慢，但更可解释

---

## 15. 配置说明

本次新增或使用的配置：

```env
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
ANTHROPIC_API_KEY=你的智谱模型API Key
MODEL_ID=glm-5

QWEATHER_API_HOST=https://n95khw2yca.re.qweatherapi.com
QWEATHER_API_TOKEN=你的和风天气Key

BIGMODEL_API_KEY=你的智谱API Key
BIGMODEL_SEARCH_ENGINE=search_std

AGENT_MAX_STEPS=4
```

注意：

- `ANTHROPIC_API_KEY` 用于模型对话
- `BIGMODEL_API_KEY` 用于智谱 Web Search
- 两者可以是同一个智谱 Key，但在代码里属于不同用途
- `QWEATHER_API_TOKEN` 用于和风天气

---

## 16. 一个完整请求示例

用户输入：

```text
北京现在天气怎么样？如果适合出门，再帮我查一下北京周末活动相关新闻。
```

可能执行过程：

```text
Thinking 1:
收到问题，开始判断是否需要调用外部工具。

Step 1 Model:
模型决定调用 get_weather。

Step 2 Tool:
get_weather({ city: "北京" })
返回：霾，32°C，湿度...

Thinking 2:
工具 get_weather 已返回结果，准备交给模型整合。

Step 3 Model:
模型根据天气结果判断还需要搜索活动新闻。

Step 4 Tool:
search_news({ query: "北京 周末 活动 新闻", count: 5 })

Step 5 Model:
模型生成最终回答。
```

最终前端会显示：

- 聊天气泡里的自然语言回答
- 右侧 Thinking
- 每个 Step 的输入输出
- Structured Output

---

## 17. 常见问题

### 17.1 为什么 Agent 模式不是直接调用工具？

因为工具是否需要调用、调用哪个工具、参数怎么填，这些都由模型根据用户自然语言决定。  
应用层只负责执行模型提出的合法工具请求。

---

### 17.2 为什么工具参数必须用 Zod 校验？

因为模型输出不可信。  
即使模型知道 schema，也可能生成错误结构。

后端必须把模型参数当成 `unknown`，校验通过后才能执行真实 API。

---

### 17.3 为什么工具失败不直接抛错？

工具失败是 Agent 正常运行的一部分。

例如：

- API Key 失效
- 城市不存在
- 外部 API 超时
- 搜索无结果

这些都应该进入执行日志，并交给模型生成可理解的回答。

---

### 17.4 Thinking 是不是模型真实思考？

不是。

这里的 Thinking 是应用层生成的过程摘要，用来告诉用户系统正在做什么。

不要把模型内部推理链路直接展示给用户。工程上更推荐展示：

- 当前阶段
- 正在调用哪个工具
- 工具是否成功
- 下一步准备整合结果

这已经足够帮助用户理解 Agent 运行过程。

---

## 18. 学习重点总结

本次落地最重要的不是“多了几个工具”，而是学会了 Agent 项目的基本工程结构：

```text
Tool Schema
  -> Tool Registry
  -> Tool Executor
  -> Agent Loop
  -> Tool Result Message
  -> Final Answer
  -> Execution Trace
  -> Streaming UI
```

你可以把它理解成第二阶段学习路线的综合练习：

- Tool Calling：模型选择工具
- Structured Output：最终结果结构化
- Schema Validation：Zod 校验工具参数
- Agent Loop：工具结果回填后继续模型调用
- SSE Streaming：把执行过程实时推给前端
- Web UI：把 Agent 从黑盒变成可观察系统

掌握这套结构后，后续新增工具就会很清晰：

1. 写一个 `tools/xxx.ts`
2. 定义 `inputSchema`
3. 定义 `argsSchema`
4. 实现 `execute`
5. 在 `registry.ts` 注册
6. 前端不用大改，就能显示新的工具执行日志

这就是一个可扩展 AI Tool Agent 的最小工程闭环。
