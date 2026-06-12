# AI 应用开发进阶

这是一个面向前端开发者转向 AI 应用工程、LLM 应用开发和 Agent 工程的学习与实践仓库。内容覆盖六个阶段：LLM 基础与 Prompt 工程、Tool Calling 与 MCP、RAG 企业知识库、Agent 与 Workflow 编排、AI 插件与 IDE Tooling、工程化与部署。

## 项目目标

- 系统理解 LLM 基础概念、Prompt 工程和模型 API 调用方式
- 从最小 Agent Loop 开始，逐步实现工具使用、记忆、任务、多 Agent 协作
- 掌握 RAG 知识库系统、LangGraph 工作流、Multi-Agent 系统等核心能力
- 沉淀可复用的学习文档、代码示例和项目作品集

## 当前进度

已完成阶段一至阶段六（理论 + 代码）：

- **阶段一**：LLM 基础、Prompt Engineering、Mini ChatGPT 应用
- **阶段二**：Tool Calling、Structured Output、MCP 协议、AI Tool Agent
- **阶段三**：Embedding、Chunking、pgvector、RAG Pipeline、企业知识库系统
- **阶段四**：Agent 模式（ReAct/Planner/Reflection）、Workflow（DAG/状态机）、LangGraph、Multi-Agent 系统
- **阶段五**：Chrome Extension、VSCode 插件、AI 网页助手、Mini Cursor
- **阶段六**：Retry/Fallback、Prompt 版本管理、Guardrails、日志监控、Token 优化、Docker 部署、CI/CD、AI 应用生产化

## 目录结构

```text
.
├── README.md
├── .env.example                  # 根目录环境变量示例
├── greet.py                      # 简单 Python 示例
├── docs/
│   ├── stage1/                   # 阶段一：LLM 基础 / Prompt / API
│   ├── stage2/                   # 阶段二：Tool Calling / MCP
│   ├── stage3/                   # 阶段三：RAG / 企业知识库
│   ├── stage4/                   # 阶段四：Agent / Workflow / LangGraph
│   └── stage5/                   # 阶段五：AI 插件 / IDE Tooling
│   └── stage6/                   # 阶段六：工程化 / 部署 / 优化
├── plan/
│   ├── 学习路线.md               # 阶段式学习路线
│   └── 目标清单.md               # Checklist 风格目标清单
├── stage1/
│   └── learncc/                  # Agent / Prompt / Tooling 教学代码
├── stage2/                       # Tool Calling / MCP 示例代码
├── stage3/                       # RAG / 向量数据库示例代码
├── stage4/                       # Agent / LangGraph / Multi-Agent 示例代码
└── code/                         # 实战项目集合
    ├── chatgpt/                  # Mini ChatGPT（Vue 3 + Express）
    ├── minidify/                 # Mini Dify Workflow Builder（Vue 3 + ReactFlow）
    ├── ai-web-assistant/         # AI 网页助手 Chrome 插件
    └── mini-cursor/              # Mini Cursor VSCode 插件（AI 代码编辑器）
```

## 核心模块

### 1. 学习路线与目标

- `plan/学习路线.md`：按 6 个阶段拆解 AI 应用开发学习路线
- `plan/目标清单.md`：以 Checklist 形式记录学习目标、项目任务和完成标准

### 2. 阶段一：LLM 基础 / Prompt / API

`docs/stage1/` 下包含阶段一的理论和工程讲解：

- LLM 基础原理
- Mini ChatGPT 技术方案
- Agent Loop、工具使用、Subagent、Skill、上下文压缩
- 持久化任务看板、后台任务、Agent 团队管理

`stage1/learncc/` 是一组渐进式 Python 示例（s01 ~ s19）。

### 3. 阶段二：Tool Calling / MCP

`docs/stage2/` 学习文档：

- Tool Calling 原理与工具设计
- Structured Output 与 Schema Validation
- Agent 工具调用循环
- MCP 协议入门
- AI Tool Agent 项目实战

`stage2/` 示例代码：

- `01-tool-calling.py`：Function Calling 实践
- `02-structured-output.py`：结构化输出
- `03-agent-loop.py`：工具调用循环
- `04-mcp-basic.py`：MCP 协议基础

### 4. 阶段三：RAG / 企业知识库

`docs/stage3/` 学习文档：

- Embedding 与相似度检索
- 文档切块 Chunking 策略
- 向量数据库与索引原理（pgvector）
- RAG Pipeline 检索增强生成
- RAG 优化与评估（Rerank、Hybrid Search）
- 企业知识库系统实战
- 中国名著知识库实践

`stage3/` 示例代码：

- `01_embedding_similarity_demo.py`：Embedding 相似度
- `02_chunking_strategy_demo.py`：切块策略对比
- `03_pgvector_practice_demo.py`：pgvector 向量检索
- `04_rag_pipeline_pgvector_demo.py`：RAG Pipeline 完整流程
- `05_ingest_three_kingdoms_embeddings.py`：中国名著入库
- `05_search_classic_literature.py`：知识库问答检索

### 5. 阶段四：Agent / Workflow / LangGraph

`docs/stage4/` 学习文档：

- Agent 基础与 ReAct 模式
- Planner-Executor 与 Agent Memory
- Reflection 与自我改进
- Workflow 基础：DAG 与状态机
- 节点调度与条件流转
- LangGraph 核心概念（State/Node/Edge/Checkpoint）
- Multi-Agent 系统实战
- Mini Dify Workflow Builder 设计

`stage4/` 示例代码：

- `01_agent_loop.py`：最小 Agent Loop
- `02_tool_use.py`：工具分发
- `03_subagent.py`：子 Agent 上下文隔离
- `04_memory_system.py`：记忆系统
- `05_plan_task.py`：任务规划
- `06_langgraph.py`：LangGraph Agent（State/Node/Edge/Checkpoint）
- `07_multi_agent.py`：四种 Multi-Agent 模式（Pipeline/Router/Collaborative/Debate）

### 6. 阶段五：AI 插件 / IDE Tooling

`docs/stage5/` 学习文档：

- AI Tooling 与 AI IDE 基础
- Chrome Extension 与 Manifest V3
- Content Script 与 Background Worker
- VSCode 插件开发基础
- Monaco 与 CodeMirror 编辑器基础
- AST 与 Parser 代码理解基础
- AI 网页助手插件实战指南
- Mini Cursor AI 代码编辑器实战指南

`code/` 实战项目：

- `code/ai-web-assistant/`：AI 网页助手 Chrome 插件（网页总结、翻译、高亮解释）
- `code/mini-cursor/`：Mini Cursor VSCode 插件（Explain / Refactor / Generate / Inline Edit）

### 7. 阶段六：工程化 / 部署 / 优化

`docs/stage6/` 学习文档：

- Retry 与 Fallback 策略
- Prompt 版本管理
- Guardrails 与输出防护
- 日志监控与可观测性
- Token 优化与成本控制
- Docker 容器化部署
- CI/CD 与自动化发布
- AI 应用生产化实战指南

### 8. 实战项目

所有完整项目集中在 `code/` 目录：

| 项目 | 技术栈 | 说明 |
|------|--------|------|
| `code/chatgpt/` | Vue 3 + Express + Anthropic SDK | Mini ChatGPT 聊天应用 |
| `code/minidify/` | Vue 3 + ReactFlow + TypeScript | 可视化 Workflow Builder |
| `code/ai-web-assistant/` | Chrome Extension Manifest V3 | AI 网页助手插件 |
| `code/mini-cursor/` | VSCode Extension + TypeScript | AI 代码编辑器插件 |

## 环境要求

- Node.js 18+
- Python 3.10+
- PostgreSQL 14+（阶段三 RAG 示例需要 pgvector 扩展）
- 可用的 Anthropic API Key，或兼容 Anthropic Messages API 的模型服务

## 环境变量

```bash
cp .env.example .env
```

至少需要配置：

```bash
ANTHROPIC_API_KEY=your_api_key_here
MODEL_ID=claude-sonnet-4-6
```

可选配置：

```bash
ANTHROPIC_BASE_URL=https://api.example.com/anthropic
MAX_TOKENS=1200
CHAT_API_PORT=8787
```

## 运行示例

### Python Agent 示例

```bash
pip install anthropic python-dotenv langgraph

# 阶段一示例
python stage1/learncc/s01_agent_loop.py

# 阶段四示例
python stage4/06_langgraph.py
python stage4/07_multi_agent.py          # 交互模式
python stage4/07_multi_agent.py debate   # 直接运行辩论模式
```

### Mini ChatGPT

```bash
cd code/chatgpt
npm install
npm run dev
```

默认服务：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`

### Mini Dify Workflow Builder

```bash
cd code/minidify
npm install
npm run dev
```

### Mini Cursor VSCode 插件

```bash
cd code/mini-cursor
npm install
# 在 VSCode 中按 F5 启动调试
```

### AI 网页助手 Chrome 插件

在 Chrome 中加载 `code/ai-web-assistant/` 目录作为未打包扩展。

## 推荐学习顺序

1. 阅读 `plan/学习路线.md` 和 `plan/目标清单.md`
2. **阶段一**：LLM 基础 → Prompt Engineering → Mini ChatGPT
3. **阶段二**：Tool Calling → Structured Output → MCP → AI Tool Agent
4. **阶段三**：Embedding → Chunking → pgvector → RAG Pipeline → 知识库系统
5. **阶段四**：ReAct → Planner-Executor → Workflow → LangGraph → Multi-Agent
6. **阶段五**：Chrome 插件 → VSCode 插件 → AI 网页助手 → Mini Cursor
7. **阶段六**：Retry/Fallback → Prompt 版本管理 → Guardrails → 日志监控 → Token 优化 → Docker → CI/CD → 生产化实战
8. 按阶段依次阅读 `docs/` 文档，运行对应的 `stage*/` 示例代码和 `code/` 项目

## 后续规划

- 完善 Mini Cursor：添加 Inline Diff 预览、多模型支持
- 完善 AI 网页助手：添加选项页配置、多语言支持
- 所有实战项目 Docker 化与 CI/CD 落地
- 整理技术博客与面试准备材料

## 注意事项

- `.env` 中包含敏感信息，只应保存在本地
- Python 示例偏教学性质，重点是理解原理，不是直接用于生产
- 各阶段示例依赖的模型 API 需要在 `.env` 中正确配置
