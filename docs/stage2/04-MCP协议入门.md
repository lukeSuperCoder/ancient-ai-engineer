# MCP 协议入门

## 文档目标

这份文档用于理解第二阶段要求中的 MCP 基础。

目标不是立即深入协议细节，而是先建立清晰认知：

- MCP 是什么
- MCP 为什么出现
- Tool / Prompt / Resource 分别是什么
- MCP Server 如何工作
- MCP 和 Tool Calling 有什么关系
- 前端转 AI 工程时应该学到什么程度

---

## 1. MCP 是什么

MCP 是 Model Context Protocol 的缩写，可以理解为：

> 一套让 AI 应用以统一方式连接外部工具、提示词和资源的协议。

没有 MCP 时，每个 AI 应用都要自己适配各种外部能力：

- 文件系统
- 数据库
- GitHub
- 浏览器
- 搜索引擎
- 内部业务系统
- 本地脚本

每个系统的接入方式都不同，工具定义、权限、返回格式、上下文注入方式也不同。

MCP 的目标是把这些外部能力抽象成统一协议，让模型客户端和工具服务之间有标准接口。

---

## 2. MCP 解决什么问题

可以从三个角度理解。

### 2.1 工具接入标准化

如果没有统一协议，接入每个工具都要写一套私有适配：

```text
AI App A -> GitHub Adapter A
AI App B -> GitHub Adapter B
AI App C -> GitHub Adapter C
```

有 MCP 后，可以变成：

```text
AI App -> MCP Client -> GitHub MCP Server
```

同一个 MCP Server 可以被多个支持 MCP 的客户端复用。

---

### 2.2 上下文获取标准化

AI 应用不只需要调用工具，也需要读取上下文。

例如：

- 当前项目文件
- 数据库表结构
- 文档内容
- 用户选择的资源
- 远程系统中的记录

MCP 提供 Resource 概念，让外部上下文可以被标准化暴露给 AI 客户端。

---

### 2.3 Prompt 复用标准化

一些场景需要预设 Prompt。

例如：

- 代码审查 Prompt
- SQL 生成 Prompt
- 文档总结 Prompt
- 工单处理 Prompt

MCP 提供 Prompt 概念，让服务端可以暴露可复用的提示词模板。

---

## 3. MCP 的三个核心概念

### 3.1 Tool

Tool 表示模型可以请求执行的动作。

例如：

- 读取文件
- 查询数据库
- 创建 Issue
- 搜索文档
- 调用业务接口

Tool 和第二阶段学习的 Tool Calling 对应非常紧密。

你可以把 MCP Tool 理解为：

> 通过协议暴露出来的标准化工具。

---

### 3.2 Resource

Resource 表示模型可以读取的上下文资源。

例如：

- 一个文件
- 一个数据库表
- 一份 API 文档
- 一个网页内容
- 一个项目配置

Resource 更偏“读上下文”，Tool 更偏“执行动作”。

对比：

```text
Resource: 读取 README.md
Tool: 修改 README.md
```

---

### 3.3 Prompt

Prompt 表示服务端提供的提示词模板。

例如：

```text
review_code(file_path)
generate_sql(question, schema)
summarize_document(document_uri)
```

Prompt 可以帮助客户端复用一套稳定的任务模板。

---

## 4. MCP Server 是什么

MCP Server 是一个暴露 Tools、Resources、Prompts 的服务。

它负责：

- 声明自己有哪些工具
- 声明自己有哪些资源
- 声明自己有哪些提示词
- 接收客户端请求
- 执行对应操作
- 返回结果

一张图：

```text
AI Client
  ↓
MCP Client
  ↓
MCP Server
  ├─ Tools
  ├─ Resources
  └─ Prompts
```

比如一个文件系统 MCP Server 可能提供：

```text
Tools:
  - write_file
  - edit_file

Resources:
  - file:///project/README.md
  - file:///project/package.json

Prompts:
  - summarize_file
  - review_file
```

---

## 5. MCP 和 Tool Calling 的关系

Tool Calling 是模型侧能力：

> 模型根据工具描述选择工具并生成参数。

MCP 是工具接入协议：

> AI 客户端通过统一协议发现和调用外部工具。

它们可以组合：

```text
模型产生 tool call
  ↓
AI 客户端识别要调用哪个工具
  ↓
如果工具来自 MCP Server
  ↓
通过 MCP Client 发请求
  ↓
MCP Server 执行工具
  ↓
返回 tool result
  ↓
模型继续生成回答
```

所以 MCP 不是替代 Tool Calling，而是让工具来源更标准、更可复用。

---

## 6. 前端转 AI 工程需要学到什么程度

第二阶段只要求“理解 MCP”。

你需要掌握：

- MCP 是外部上下文和工具接入协议
- Tool / Resource / Prompt 的区别
- MCP Server 暴露能力，MCP Client 使用能力
- MCP 可以让 AI IDE 或 Agent 复用外部工具
- MCP 和 Tool Calling 可以协同工作

暂时不必深入：

- 协议传输细节
- 完整 SDK 源码
- 复杂权限模型
- 多 Server 编排

等到后面学习 AI IDE、Agent Workflow、企业系统集成时，再深入实现 MCP Server。

---

## 7. 用一个例子理解 MCP

假设你要做一个 AI 代码助手。

没有 MCP 时，你可能要在应用里直接写：

- 读文件函数
- 写文件函数
- 搜索文件函数
- Git diff 函数
- 执行测试函数

这些能力都和你的 AI 应用耦合在一起。

使用 MCP 后，可以拆成：

```text
AI 代码助手
  ↓
连接 FileSystem MCP Server
  ↓
连接 Git MCP Server
  ↓
连接 Test Runner MCP Server
```

AI 应用只负责对话、决策和展示。具体工具能力由 MCP Server 提供。

---

## 8. 学完后的检查标准

你应该能回答：

- MCP 是什么？
- MCP 为什么会出现？
- Tool、Resource、Prompt 分别是什么？
- MCP Server 做什么？
- MCP 和 Tool Calling 是什么关系？
- 为什么 AI IDE 特别适合使用 MCP？

你可以用一句话总结：

> Tool Calling 让模型知道怎么提出工具调用请求，MCP 让 AI 应用用统一方式接入外部工具和上下文。

