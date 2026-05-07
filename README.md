# AI 应用开发进阶

这是一个面向前端开发者转向 AI 应用工程、LLM 应用开发和 Agent 工程的学习与实践仓库。当前项目以“阶段一”为主线，包含 LLM 基础、Prompt 工程、模型 API 接入、Agent Loop、工具调用、任务系统、团队协作协议，以及一个可运行的 Mini ChatGPT 对话应用。

## 项目目标

- 系统理解 LLM 基础概念、Prompt 工程和模型 API 调用方式
- 从最小 Agent Loop 开始，逐步实现工具使用、记忆、任务、后台任务和多 Agent 协作
- 完成一个具备真实流式对话能力的 Mini ChatGPT 应用
- 沉淀可复用的学习文档、代码示例和项目作品集

## 当前进度

当前仓库主要完成了阶段一内容：

- LLM 基础原理文档
- Prompt Engineering 学习资料与实验模板
- Python 版 Agent 机制教学示例
- Vue 3 + Express + Anthropic SDK 的 Mini ChatGPT 项目
- System Prompt、上下文历史、Markdown 渲染、代码高亮和流式输出
- Agent 任务、记忆、权限、后台任务、团队协议、worktree 隔离等示例代码与文档

## 目录结构

```text
.
├── README.md
├── .env.example                 # 根目录环境变量示例
├── greet.py                     # 简单 Python 示例
├── docs/
│   └── stage1/                  # 阶段一课程讲解文档
├── plan/
│   ├── 学习路线.md              # 阶段式学习路线
│   └── 目标清单.md              # Checklist 风格目标清单
├── stage1/
│   ├── chatgpt/                 # Mini ChatGPT 前后端项目
│   └── learncc/                 # Agent / Prompt / Tooling 教学代码
└── stage2/                      # 后续阶段预留目录
```

## 核心模块

### 1. 学习路线与目标

- `plan/学习路线.md`：按阶段拆解 AI 应用开发学习路线
- `plan/目标清单.md`：以 Checklist 形式记录学习目标、项目任务和完成标准

### 2. 阶段一文档

`docs/stage1/` 下包含阶段一的理论和工程讲解，包括：

- LLM 基础原理
- Mini ChatGPT 技术方案
- Agent Loop
- 工具使用
- Subagent
- Skill 使用
- 上下文压缩
- 持久化任务看板
- 后台任务
- Agent 团队管理
- 团队协议
- Worktree 任务管理

### 3. Agent 教学代码

`stage1/learncc/` 是一组渐进式 Python 示例，用来拆解 Codex / Claude Code 类 Agent 的核心机制：

- `s01_agent_loop.py`：最小 Agent Loop
- `s02_tool_use.py`：模型工具调用
- `s03_todo_write.py`：待办事项写入
- `s04_subagent.py`：Subagent 拆分
- `s05_skill_loading.py`：Skill 加载
- `s06_context_compact.py`：上下文压缩
- `s07_permission_system.py`：权限系统
- `s08_hook_system.py`：Hook 系统
- `s09_memory_system.py`：记忆系统
- `s12_task_system.py`：任务系统
- `s13_background_tasks.py`：后台任务
- `s15_agent_teams.py`：Agent 团队
- `s18_worktree_task_isolation.py`：Worktree 任务隔离
- `s19_mcp_plugin.py`：MCP / Plugin 示例

### 4. Prompt Engineering

`stage1/learncc/prompt_engineering/` 包含 System Prompt Engineering 学习模块：

- `docs/`：Prompt 基础、六大策略、最佳实践
- `templates/`：coder、analyst、writer、translator 等模板
- `experiments/`：角色提示词、约束提示词、Few-shot 等实验代码

### 5. Mini ChatGPT

`stage1/chatgpt/` 是当前主要可运行应用。

技术栈：

- 前端：Vue 3、Vite、TypeScript、Tailwind CSS
- 后端：Express、Anthropic SDK
- 能力：流式对话、System Prompt、历史会话、Markdown 渲染、代码高亮、本地存储

后端接口：

- `GET /api/health`：健康检查与模型信息
- `POST /api/chat`：非流式对话
- `POST /api/chat/stream`：SSE 流式对话

## 环境要求

- Node.js 18+
- npm
- Python 3.10+
- 可用的 Anthropic API Key，或兼容 Anthropic Messages API 的模型服务

## 环境变量

复制根目录环境变量示例：

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

说明：

- 根目录 `.env` 会被 Python 示例和 Mini ChatGPT 后端读取
- `stage1/chatgpt/.env` 可用于单独覆盖 ChatGPT 项目配置
- 不要提交真实 API Key

## 运行 Mini ChatGPT

进入应用目录：

```bash
cd stage1/chatgpt
```

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

默认服务：

- 前端：Vite 输出的本地地址，通常是 `http://localhost:5173`
- 后端：`http://localhost:8787`
- 前端会通过 Vite proxy 将 `/api` 请求转发到后端

构建生产版本：

```bash
npm run build
```

预览构建结果：

```bash
npm run preview
```

## 运行 Python Agent 示例

先安装依赖：

```bash
pip install anthropic python-dotenv
```

确保根目录 `.env` 已配置 `ANTHROPIC_API_KEY` 和 `MODEL_ID`，然后运行示例：

```bash
cd stage1/learncc
python s01_agent_loop.py
```

不同章节示例可按文件编号依次运行和阅读。

## 推荐学习顺序

1. 阅读 `plan/学习路线.md` 和 `plan/目标清单.md`
2. 阅读 `docs/stage1/LLM基础原理讲解.md`
3. 学习 `stage1/learncc/prompt_engineering/`
4. 按顺序运行 `stage1/learncc/s01_*.py` 到 `s19_*.py`
5. 阅读 `docs/stage1/ChatGpt-Mini对话机器人技术方案与原理讲解.md`
6. 运行并理解 `stage1/chatgpt/`
7. 根据 Checklist 补齐 Mini ChatGPT 的产品体验和工程能力

## 后续规划

`stage2/` 目前是预留目录，适合继续扩展：

- Tool Calling / Function Calling
- Structured Output
- RAG 与向量数据库
- MCP Server / Client
- 多 Agent 协作系统
- AI IDE / Coding Agent 项目
- 部署、监控、评测与成本控制

## 注意事项

- `.env` 中包含敏感信息，只应保存在本地
- `stage1/chatgpt/node_modules/` 和构建产物不应作为主要源码阅读对象
- Python 示例偏教学性质，重点是理解 Agent 机制，而不是直接作为生产框架使用
- Mini ChatGPT 是当前最完整的应用项目，适合作为阶段一作品集基础
