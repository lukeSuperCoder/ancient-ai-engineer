# Mini ChatGPT 对话机器人技术方案与原理讲解

## 1. 项目目标

本项目基于 `Vue3 + TypeScript + Vite + Tailwind CSS` 实现一个可用的 Mini ChatGPT 对话机器人，核心目标不是只做一个静态聊天界面，而是完整打通：

- 聊天 UI
- Message List
- 输入框
- 模型 API 接入
- Streaming 打字机效果
- Markdown 渲染
- Code Highlight
- System Prompt
- 上下文历史
- Loading 和 Error 状态

最终完成后，学习者应该能独立解释一个聊天产品的工程链路，也能说明 LLM 基础原理和 Prompt 优化方式。

---

## 2. 总体技术方案

推荐采用“前端聊天界面 + 后端 API 代理 + OpenAI Responses API”的结构。

```text
用户
  ↓
Vue3 Chat UI
  ↓
前端 /api/chat 请求
  ↓
后端 API 代理
  ↓
OpenAI Responses API
  ↓
SSE 流式事件
  ↓
前端逐字追加 assistant 消息
```

### 为什么需要后端 API 代理

前端不能直接暴露 `OPENAI_API_KEY`。如果浏览器直接调用 OpenAI API，密钥会出现在网络请求或打包产物中，任何用户都可以复制滥用。

因此应该增加一个轻量后端代理：

- 前端只请求本项目自己的 `/api/chat`
- API Key 只保存在后端环境变量中
- 后端负责调用模型 API
- 后端把模型流式输出转发给前端

教学项目可以用 Vite dev server 之外的轻量 Node 服务实现，也可以用部署平台的 serverless function 实现。关键原则是：密钥只在服务端使用。

---

## 3. 推荐目录结构

```text
mini-chatgpt/
  src/
    main.ts
    App.vue
    styles.css
    types/
      chat.ts
    components/
      ChatShell.vue
      MessageList.vue
      ChatMessage.vue
      ChatInput.vue
      SystemPromptPanel.vue
    composables/
      useChat.ts
    utils/
      markdown.ts
      stream.ts
  server/
    index.ts
    openai.ts
  .env.example
  package.json
  vite.config.ts
  tailwind.config.ts
```

### 核心职责划分

| 模块 | 职责 |
| --- | --- |
| `ChatShell.vue` | 页面主体布局，组合消息列表、输入框、系统提示词面板 |
| `MessageList.vue` | 渲染消息列表，处理空状态、滚动到底部 |
| `ChatMessage.vue` | 单条消息展示，支持 Markdown 和代码高亮 |
| `ChatInput.vue` | 输入框、发送按钮、快捷键、禁用态 |
| `SystemPromptPanel.vue` | 编辑 system prompt |
| `useChat.ts` | 管理消息状态、发送请求、流式更新 |
| `server/openai.ts` | 封装 OpenAI API 调用 |
| `server/index.ts` | 暴露 `/api/chat` 接口并转发流式响应 |

---

## 4. 数据模型设计

前端消息结构建议独立定义，不直接复用第三方 API 的原始结构。

```ts
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
}
```

### 为什么不直接使用 API 原始结构

业务 UI 需要 `id`、`createdAt`、`status` 这些字段，但模型 API 不一定需要。把前端消息模型和 API 请求模型拆开，可以降低后续改 API、加本地存储、加重试按钮时的改动成本。

---

## 5. API 接入方案

### 5.1 接口选择

OpenAI 当前推荐新项目优先使用 `Responses API`。它是面向文本、多模态、工具调用和多轮状态的统一接口，并且原生支持流式语义事件。`Chat Completions API` 仍可用，但更适合作为兼容旧项目的方案。

本项目建议：

- 新实现使用 `Responses API`
- 后端封装 API 差异，前端只关心文本流
- 模型 ID 通过环境变量配置

示例环境变量：

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
```

说明：截至 2026-05-07，OpenAI 官方模型文档建议低延迟、低成本场景可从 `gpt-5.4-mini` 或更小型号开始。课程项目不要把模型名写死在前端，实际运行时以账号可用模型和课程成本要求为准。

### 5.2 后端请求形态

后端接收前端提交的：

```ts
interface ChatRequest {
  systemPrompt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}
```

后端组装成模型输入：

```ts
const input = [
  {
    role: "developer",
    content: systemPrompt || "You are a helpful assistant.",
  },
  ...messages.map((message) => ({
    role: message.role,
    content: message.content,
  })),
];
```

这里把界面里的 System Prompt 映射成 `developer` 指令。原因是应用开发者指令的优先级应该高于普通用户输入，适合放产品规则、回答风格和安全边界。

---

## 6. Streaming 打字机效果原理

### 6.1 流式响应是什么

普通请求是“模型生成完整答案后一次性返回”。流式请求是模型边生成边返回片段，前端收到一个片段就更新一次界面，因此用户能看到类似打字机的效果。

```text
用户发送问题
  ↓
创建一条空 assistant 消息
  ↓
后端开启 stream
  ↓
前端不断读取 chunk
  ↓
把 delta 文本追加到 assistant.content
  ↓
stream 结束后标记为 done
```

### 6.2 前端状态更新逻辑

```ts
const assistantMessage: ChatMessage = {
  id: crypto.randomUUID(),
  role: "assistant",
  content: "",
  createdAt: Date.now(),
  status: "streaming",
};

messages.value.push(userMessage, assistantMessage);

for await (const delta of streamChat(requestBody)) {
  assistantMessage.content += delta;
}

assistantMessage.status = "done";
```

### 6.3 错误处理

流式请求可能在中途失败，例如网络断开、API 超时、额度不足。前端需要保留已经收到的内容，同时把消息标记为 `error`。

```ts
try {
  for await (const delta of streamChat(requestBody)) {
    assistantMessage.content += delta;
  }
  assistantMessage.status = "done";
} catch (error) {
  assistantMessage.status = "error";
  if (!assistantMessage.content) {
    assistantMessage.content = "请求失败，请稍后重试。";
  }
}
```

---

## 7. Markdown 与代码高亮方案

### 7.1 Markdown 渲染

模型输出通常包含列表、表格、引用、代码块，因此需要 Markdown 渲染。

推荐库：

- `markdown-it` 或 `marked`
- `highlight.js` 或 `shiki`
- `dompurify`

建议组合：

```text
markdown-it + highlight.js + dompurify
```

原因：

- `markdown-it` 轻量，适合教学项目
- `highlight.js` 接入简单，能覆盖常见语言
- `dompurify` 用于清洗 HTML，避免 XSS 风险

### 7.2 安全原则

模型输出不能被当作可信 HTML。即使内容来自模型，也可能包含用户诱导生成的 `<script>`、事件属性或危险链接。

渲染链路应该是：

```text
Markdown 文本
  ↓
markdown-it 转 HTML
  ↓
dompurify 清洗
  ↓
v-html 渲染
```

---

## 8. System Prompt 设计

System Prompt 是应用层给模型的长期规则，决定机器人的身份、语气、边界和输出格式。

示例：

```text
你是一个面向前端初学者的 AI 编程助教。
回答要求：
1. 优先用中文解释。
2. 先给结论，再解释原因。
3. 代码示例使用 TypeScript。
4. 如果用户问题不清楚，先指出缺失信息。
```

### Prompt 优化原则

1. 明确角色：告诉模型它是谁。
2. 明确任务：告诉模型要解决什么问题。
3. 明确输出格式：例如列表、步骤、代码块、JSON。
4. 明确边界：哪些事情不能做，哪些情况需要追问。
5. 提供示例：复杂格式最好给一到两个样例。

### 常见错误

- 只写“你是一个助手”，缺少具体任务边界
- 同时要求“简洁”和“详细”，指令互相冲突
- 把业务规则放在用户消息里，导致容易被后续输入覆盖
- 没有约束输出格式，导致前端解析困难

---

## 9. 上下文历史方案

### 9.1 基础方案

每次请求都把最近若干轮对话发给后端：

```text
system/developer prompt
最近 N 条 user/assistant 消息
当前 user 问题
```

这样模型才能知道前文，例如：

```text
用户：我想学 Vue
助手：可以从组件、响应式、路由开始
用户：第二个再解释一下
```

如果不传历史，模型无法知道“第二个”指的是“响应式”。

### 9.2 Token 控制

聊天历史越长，输入 Token 越多，成本和延迟越高，还可能超过模型上下文窗口。

第一版建议做简单窗口截断：

- 保留 system prompt
- 保留最近 10 到 20 条消息
- 后续再扩展“历史摘要”

```ts
function getRecentMessages(messages: ChatMessage[], limit = 20) {
  return messages
    .filter((message) => message.role !== "system")
    .slice(-limit);
}
```

---

## 10. 前端交互方案

### 10.1 页面布局

```text
+------------------------------------------------+
| Header: Mini ChatGPT                           |
+----------------------+-------------------------+
| System Prompt Panel  | Message List            |
|                      |                         |
|                      |                         |
|                      +-------------------------+
|                      | Chat Input              |
+----------------------+-------------------------+
```

移动端可以把 System Prompt 收进抽屉或折叠面板。

### 10.2 输入框行为

- `Enter` 发送
- `Shift + Enter` 换行
- 请求中禁用重复发送
- 空内容不能发送
- 发送后清空输入框
- 出错后允许重新发送

### 10.3 Loading 状态

建议拆成两个状态：

- `isSending`: 请求刚发出，还没收到第一个 token
- `isStreaming`: 已经收到流式内容，正在继续生成

这样 UI 可以分别展示：

- 等待模型响应
- 正在生成

---

## 11. LLM 基础原理讲解

### 11.1 模型为什么能生成回答

LLM 的底层任务可以理解为：根据已有上下文预测下一个 Token。

```text
输入：Vue 的响应式原理是
模型预测下一个 token：
  "基于"  0.32
  "通过"  0.21
  "指"    0.08
```

模型不断预测下一个 Token，并把新 Token 接回上下文，就形成了完整回答。

### 11.2 为什么上下文有用

Transformer 的 Attention 机制会让模型在生成当前 Token 时关注上下文中相关位置。例如用户问“第二个再解释一下”，模型需要回看上一轮回答中列出的第二项。

### 11.3 为什么 Prompt 会影响结果

Prompt 本质上也是上下文的一部分。模型不是执行传统代码，而是在当前上下文条件下生成最可能符合要求的输出。因此，越清晰的角色、任务、格式和边界，越容易得到稳定结果。

### 11.4 为什么 Streaming 不等于模型更快

Streaming 主要优化的是“首字响应时间”和用户感知速度。模型总生成时间不一定减少，但用户不用等完整答案生成完才看到内容。

---

## 12. 开发里程碑

### 第一阶段：静态 UI

- 初始化 Vue3 + TypeScript + Vite + Tailwind CSS
- 完成聊天页面布局
- 完成 Message List
- 完成 Chat Input
- 使用 mock 数据展示 user 和 assistant 消息

验收标准：不接 API，也能看到完整聊天界面。

### 第二阶段：本地状态

- 实现 `useChat`
- 支持发送消息
- 创建 assistant 占位消息
- 支持 loading、error、done 状态

验收标准：输入消息后，界面能追加用户消息和模拟机器人回复。

### 第三阶段：模型 API

- 增加后端 API 代理
- 配置 `OPENAI_API_KEY`
- 接入 Responses API
- 完成非流式返回

验收标准：输入问题后能得到真实模型回答。

### 第四阶段：Streaming

- 后端开启流式响应
- 前端读取流并逐步追加文本
- 完成请求中断和错误处理

验收标准：回答能以打字机效果显示。

### 第五阶段：增强体验

- Markdown 渲染
- Code Highlight
- System Prompt 编辑
- 上下文历史截断
- 自动滚动到底部
- 增加历史对话记录保存查看和删除

验收标准：能稳定完成多轮技术问答，代码块可读。

---

## 13. 关键风险与处理

| 风险 | 表现 | 处理方式 |
| --- | --- | --- |
| API Key 泄露 | 前端代码中出现密钥 | 只在后端读取环境变量 |
| 长上下文成本高 | 响应变慢、费用上升 | 限制历史条数，后续做摘要 |
| 流式中断 | 回复到一半停止 | 保留已生成内容，显示重试 |
| Markdown XSS | 模型输出危险 HTML | 使用 `dompurify` 清洗 |
| 重复发送 | 用户连续点击发送 | 请求中禁用发送按钮 |
| Prompt 被覆盖 | 用户要求忽略规则 | 把系统规则放在 developer/system 层 |

---

## 14. 推荐依赖

```sh
npm create vite@latest mini-chatgpt -- --template vue-ts
npm install
npm install tailwindcss @tailwindcss/vite
npm install openai express cors dotenv
npm install markdown-it highlight.js dompurify
npm install -D @types/express @types/cors @types/markdown-it
```

如果项目使用 serverless function，则可以不安装 `express`，改用对应平台的 API route。

---

## 15. 完成标准映射

| 需求文档项目 | 技术实现 |
| --- | --- |
| 搭建聊天 UI | `ChatShell.vue` + Tailwind 布局 |
| 实现 Message List | `MessageList.vue` |
| 实现输入框 | `ChatInput.vue` |
| 接入模型 API | `server/openai.ts` |
| Streaming 打字机效果 | SSE + 前端流读取 |
| Markdown 渲染 | `markdown-it` |
| Code Highlight | `highlight.js` |
| System Prompt | `SystemPromptPanel.vue` + developer 指令 |
| 上下文历史 | `useChat.ts` 管理最近 N 条消息 |
| Loading/Error 状态 | message.status + 全局请求状态 |

---

## 16. 参考资料

- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI Streaming Responses: https://platform.openai.com/docs/api-reference/streaming
- OpenAI Responses vs Chat Completions: https://platform.openai.com/docs/guides/responses-vs-chat-completions
- OpenAI Prompt Engineering: https://platform.openai.com/docs/guides/prompt-engineering
- OpenAI Models: https://developers.openai.com/api/docs/models
