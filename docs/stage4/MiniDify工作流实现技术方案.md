# Mini Dify 工作流实现技术方案

---

## 项目定位

> 轻量化 Workflow Builder Demo，纯前端项目，无后台服务，通过浏览器直接调用 LLM API 完成工作流执行。

**不是** Dify 的替代品，而是一个**理解 Workflow 编排原理**的学习项目。

---

## 核心功能范围

根据目标清单，Mini Dify 包含 6 个功能点：

```
[1] ReactFlow 搭建画布         — 可视化拖拽编辑工作流
[2] Prompt 节点               — 配置 prompt 模板，调用 LLM
[3] Tool 节点                 — 执行预定义工具（非 LLM 调用）
[4] If 节点                   — 条件判断，分流执行路径
[5] DAG 执行引擎              — 按拓扑顺序执行节点链
[6] 日志/调试面板              — 展示每个节点的输入/输出/耗时
```

---

## 系统架构

```
┌─────────────────────────────────────────────────┐
│                   浏览器 (SPA)                    │
│                                                   │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │ ReactFlow   │    │     执行引擎 (TS)         │ │
│  │ 可视化画布   │───▶│                          │ │
│  │             │◀───│  ┌─ DAG 拓扑排序          │ │
│  │ - 拖拽节点   │    │  ├─ 节点执行器            │ │
│  │ - 连线      │    │  ├─ 变量上下文            │ │
│  │ - 配置面板   │    │  └─ 日志收集器            │ │
│  └─────────────┘    └──────────┬───────────────┘ │
│                                │                  │
│                     ┌──────────▼──────────┐       │
│                     │   LLM API (fetch)    │       │
│                     │   OpenAI / Anthropic │       │
│                     └─────────────────────┘       │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │           日志 / 调试面板                      │ │
│  │  节点执行顺序 │ 输入输出 │ 耗时 │ 状态        │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**关键设计：无后端。** LLM API 通过浏览器端 fetch 直接调用（需要用户在前端填入 API Key，或通过 Vite dev server 代理解决 CORS）。

---

## 技术选型

| 类别 | 技术 | 理由 |
|------|------|------|
| 框架 | React 18 + TypeScript | 生态成熟，类型安全 |
| 画布 | ReactFlow | 最成熟的 React 流程图库 |
| 状态管理 | Zustand | 轻量，适合中小项目 |
| UI 组件 | Ant Design | 开箱即用，中文友好 |
| 样式 | Tailwind CSS | 快速布局 |
| 构建 | Vite | 开发体验好，支持 API 代理 |
| LLM 调用 | fetch / openai SDK (browser) | 无需后端 |

---

## 数据结构设计

### 节点（Node）

```typescript
// 节点类型
type NodeType = 'start' | 'end' | 'prompt' | 'tool' | 'if';

// 节点数据
interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

// 不同节点的 data
interface StartNodeData {
  label: string;
  inputSchema: { key: string; type: string; label: string }[];
}

interface EndNodeData {
  label: string;
  outputKey: string;
}

interface PromptNodeData {
  label: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;       // 支持 {{变量名}} 模板语法
  temperature: number;
  outputVariable: string;   // 输出存入哪个变量
}

interface ToolNodeData {
  label: string;
  toolName: string;         // 预注册的工具名
  params: Record<string, string>;  // 参数支持 {{变量名}}
  outputVariable: string;
}

interface IfNodeData {
  label: string;
  variableName: string;     // 要判断的变量
  operator: 'contains' | 'equals' | 'not_empty' | 'gt' | 'lt';
  value: string;            // 比较值
}
```

### 边（Edge）

```typescript
interface WorkflowEdge {
  id: string;
  source: string;            // 起始节点 ID
  target: string;            // 目标节点 ID
  sourceHandle?: 'true' | 'false';  // If 节点的分支端口
}
```

### 执行上下文

```typescript
// 工作流执行时共享的变量上下文
interface ExecutionContext {
  variables: Record<string, any>;   // 变量池
  logs: ExecutionLog[];             // 执行日志
}

interface ExecutionLog {
  nodeId: string;
  nodeName: string;
  timestamp: number;
  input: any;
  output: any;
  duration: number;    // ms
  status: 'running' | 'success' | 'error';
  error?: string;
}
```

---

## 执行引擎设计

核心是一个按拓扑顺序遍历节点图的执行器：

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│ 加载工作流 │───▶│ 拓扑排序节点  │───▶│ 顺序执行  │
└──────────┘    └──────────────┘    └──────────┘
                                          │
                    ┌─────────────────────┐│
                    │ 对每个节点：          │▼
                    │ 1. 替换模板变量       │
                    │ 2. 执行节点逻辑       │
                    │ 3. 写回输出变量       │
                    │ 4. 记录执行日志       │
                    │ 5. If节点选择分支     │
                    └─────────────────────┘
```

### 执行流程伪代码

```typescript
async function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  input: Record<string, any>
): Promise<ExecutionContext> {

  const ctx: ExecutionContext = {
    variables: { ...input },
    logs: []
  };

  // 1. 从 Start 节点开始
  let currentNodeId = findStartNode(nodes)?.id;
  if (!currentNodeId) throw new Error('缺少 Start 节点');

  // 2. 逐步执行
  while (currentNodeId) {
    const node = getNode(nodes, currentNodeId);
    const startTime = Date.now();

    // 记录日志
    const log: ExecutionLog = {
      nodeId: node.id,
      nodeName: node.data.label,
      timestamp: startTime,
      input: snapshot(ctx.variables),
      output: null,
      duration: 0,
      status: 'running'
    };
    ctx.logs.push(log);

    // 执行节点
    const result = await executeNode(node, ctx);

    // 更新日志
    log.output = result;
    log.duration = Date.now() - startTime;
    log.status = 'success';

    // 找下一个节点
    if (node.type === 'end') break;

    currentNodeId = getNextNodeId(node, result, edges);
  }

  return ctx;
}
```

### 各节点执行逻辑

```typescript
async function executeNode(
  node: WorkflowNode,
  ctx: ExecutionContext
): Promise<any> {

  switch (node.type) {

    case 'start':
      return null;  // 不做事，变量已在 ctx 中

    case 'prompt':
      // 替换模板变量 → 调用 LLM API → 存入输出变量
      const sysMsg = replaceVars(node.data.systemPrompt, ctx.variables);
      const userMsg = replaceVars(node.data.userPrompt, ctx.variables);
      const response = await callLLM({
        model: node.data.model,
        messages: [
          { role: 'system', content: sysMsg },
          { role: 'user', content: userMsg }
        ],
        temperature: node.data.temperature
      });
      ctx.variables[node.data.outputVariable] = response;
      return response;

    case 'tool':
      // 替换参数变量 → 执行本地工具函数 → 存入输出变量
      const params = replaceVarsInObj(node.data.params, ctx.variables);
      const toolResult = await executeTool(node.data.toolName, params);
      ctx.variables[node.data.outputVariable] = toolResult;
      return toolResult;

    case 'if':
      // 取变量值 → 条件判断 → 返回 'true' / 'false'
      const val = ctx.variables[node.data.variableName];
      const condition = evaluateCondition(
        val,
        node.data.operator,
        node.data.value
      );
      return condition ? 'true' : 'false';

    case 'end':
      return ctx.variables;
  }
}

// 下一个节点
function getNextNodeId(
  node: WorkflowNode,
  result: any,
  edges: WorkflowEdge[]
): string | null {

  const outEdges = edges.filter(e => e.source === node.id);

  if (node.type === 'if') {
    // If 节点：根据结果匹配 sourceHandle
    const matched = outEdges.find(e => e.sourceHandle === result);
    return matched?.target ?? null;
  }

  // 普通节点：走第一条无条件的边
  return outEdges[0]?.target ?? null;
}
```

---

## 预注册工具

Demo 中内置几个简单工具，无需后端：

```typescript
const builtinTools: Record<string, ToolFunction> = {

  // 当前时间
  current_time: async () => {
    return new Date().toLocaleString('zh-CN');
  },

  // 文本处理
  text_transform: async (params: { text: string; action: string }) => {
    switch (params.action) {
      case 'upper': return params.text.toUpperCase();
      case 'lower': return params.text.toLowerCase();
      case 'length': return String(params.text.length);
      default: return params.text;
    }
  },

  // 简单计算
  calculate: async (params: { expression: string }) => {
    // 仅支持基础四则运算
    const sanitized = params.expression.replace(/[^0-9+\-*/().]/g, '');
    return String(Function(`"use strict"; return (${sanitized})`)());
  },

  // JSON 格式化
  format_json: async (params: { text: string }) => {
    try {
      return JSON.stringify(JSON.parse(params.text), null, 2);
    } catch {
      return 'Invalid JSON';
    }
  }
};
```

---

## 前端页面结构

```
┌──────────────────────────────────────────────────────┐
│  工具栏：[保存] [加载示例] [运行] [清空]    API Key 配置  │
├──────────────┬───────────────────────┬───────────────┤
│              │                       │               │
│   节点面板    │     ReactFlow 画布     │   配置面板     │
│              │                       │               │
│  ┌────────┐  │  ┌─────┐  ┌─────┐    │  选中节点的     │
│  │ Start  │  │  │Start│─▶│Prompt│   │  配置表单       │
│  ├────────┤  │  └─────┘  └──┬──┘    │               │
│  │ Prompt │  │              │       │  - Prompt内容   │
│  ├────────┤  │         ┌────▼────┐  │  - 模型选择     │
│  │  Tool  │  │         │If/Else │  │  - 温度         │
│  ├────────┤  │         └──┬──┬──┘  │  - 输出变量名   │
│  │  If    │  │            │  │     │               │
│  ├────────┤  │         ┌──▼┐┌▼──┐  │               │
│  │  End   │  │         │End││End│  │               │
│  └────────┘  │         └───┘└───┘  │               │
│              │                       │               │
├──────────────┴───────────────────────┴───────────────┤
│                                                      │
│  日志 / 调试面板（可折叠）                               │
│                                                      │
│  ┌──────┬──────────┬──────────┬──────┬────────┐     │
│  │ 节点  │   输入    │   输出    │ 耗时  │  状态  │     │
│  ├──────┼──────────┼──────────┼──────┼────────┤     │
│  │ 开始  │ {msg:…}  │  null    │  0ms │  ✅    │     │
│  │ 提取  │ {msg:…}  │ "退款"   │ 1.2s │  ✅    │     │
│  │ 判断  │ "退款"   │ "true"   │  0ms │  ✅    │     │
│  │ 回复  │ "退款"   │ "好的…"  │ 2.1s │  ✅    │     │
│  └──────┴──────────┴──────────┴──────┴────────┘     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 页面分为 4 个区域

1. **顶部工具栏**：保存/加载/运行 + API Key 配置
2. **左侧节点面板**：拖拽添加节点到画布
3. **中间画布**：ReactFlow 可视化编辑区
4. **右侧配置面板**：选中节点后编辑其参数
5. **底部日志面板**：执行时实时展示每个节点的运行日志

---

## 状态管理（Zustand Store）

```typescript
interface WorkflowStore {
  // 画布状态
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;

  // 执行状态
  isRunning: boolean;
  executionLogs: ExecutionLog[];
  variables: Record<string, any>;

  // API 配置
  apiKey: string;
  apiBaseUrl: string;

  // 操作
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  addEdge: (source: string, target: string, sourceHandle?: string) => void;
  removeEdge: (id: string) => void;
  selectNode: (id: string | null) => void;

  // 执行
  runWorkflow: (input: Record<string, any>) => Promise<void>;
  clearLogs: () => void;
}
```

---

## LLM API 调用方案

复用 ChatGPT 项目 (`code/chatgpt`) 的 API 配置方式：Anthropic SDK + Vite 代理 + `.env` 环境变量。

### 环境变量

在项目根目录的 `.env` 中读取（与现有项目共享）：

```bash
# 已在项目根 .env 中配置，Mini Dify 复用同一套
ANTHROPIC_API_KEY=xxx
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic  # BigModel 兼容 Anthropic 协议
MODEL_ID=claude-sonnet-4-20250514
```

### Vite 代理

浏览器无法直接调用 Anthropic API（CORS 限制），通过 Vite dev server 代理转发：

```typescript
// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/anthropic': {
          target: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        }
      }
    }
  };
});
```

### LLM 调用封装

与 `code/chatgpt/server/model.ts` 保持一致的调用模式，但适配浏览器端 fetch：

```typescript
// services/llm.ts
// 调用 Anthropic Messages API（通过 Vite 代理）

interface LLMCallOptions {
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature: number;
}

export async function callLLM(options: LLMCallOptions): Promise<string> {
  const apiKey = localStorage.getItem('mini-dify-api-key') || '';

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      system: options.system,
      messages: options.messages,
      temperature: options.temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API 调用失败: ${response.status}`);
  }

  const data = await response.json();

  // Anthropic Messages API 返回格式：content 是 block 数组
  return data.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')
    .trim();
}
```

### 与 ChatGPT 项目的关系

```
ChatGPT 项目 (code/chatgpt)          Mini Dify (code/mini-dify)
┌────────────────────────┐          ┌────────────────────────┐
│ Express 后端            │          │ 纯前端（无 Express）     │
│ @anthropic-ai/sdk      │          │ fetch 直调              │
│ server/model.ts        │          │ services/llm.ts         │
│        │               │          │        │               │
│        ▼               │          │        ▼               │
│ Anthropic SDK → API    │          │ Vite Proxy → API        │
│ (BigModel 兼容端点)     │          │ (同一个 BigModel 端点)   │
└────────────────────────┘          └────────────────────────┘

共同点：
  - 共享根目录 .env 的 API 配置
  - 都调用 Anthropic Messages API（BigModel 兼容协议）
  - Prompt 节点中的 model 字段默认使用 MODEL_ID 环境变量
```

---

## 项目目录结构

```
mini-dify/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── src/
│   ├── main.tsx                  # 入口
│   ├── App.tsx                   # 主布局
│   ├── store/
│   │   └── workflowStore.ts      # Zustand 状态管理
│   ├── engine/
│   │   ├── executor.ts           # 工作流执行引擎
│   │   ├── nodeExecutor.ts       # 各类型节点执行逻辑
│   │   ├── templateEngine.ts     # {{变量}} 模板替换
│   │   └── builtinTools.ts       # 内置工具函数
│   ├── components/
│   │   ├── Canvas.tsx             # ReactFlow 画布
│   │   ├── Toolbar.tsx            # 顶部工具栏
│   │   ├── NodePanel.tsx          # 左侧节点面板
│   │   ├── ConfigPanel.tsx        # 右侧配置面板
│   │   ├── LogPanel.tsx           # 底部日志面板
│   │   ├── nodes/
│   │   │   ├── StartNode.tsx
│   │   │   ├── EndNode.tsx
│   │   │   ├── PromptNode.tsx
│   │   │   ├── ToolNode.tsx
│   │   │   └── IfNode.tsx
│   │   └── config-panels/
│   │       ├── PromptConfig.tsx
│   │       ├── ToolConfig.tsx
│   │       └── IfConfig.tsx
│   ├── services/
│   │   └── llm.ts                # LLM API 调用封装
│   ├── types/
│   │   └── workflow.ts           # 类型定义
│   └── utils/
│       └── helpers.ts             # 工具函数
```

---

## 实现步骤

### 第一阶段：画布与节点（2-3天）

1. 初始化 Vite + React + TypeScript 项目
2. 集成 ReactFlow，搭建基础画布
3. 实现 5 种自定义节点组件（Start / End / Prompt / Tool / If）
4. 实现拖拽添加节点、连线功能
5. 实现左侧节点面板

### 第二阶段：配置与状态（2天）

6. 实现 Zustand Store，管理节点和边的数据
7. 实现右侧配置面板，编辑各节点的参数
8. 实现工作流的保存/加载（localStorage）
9. 实现 API Key 配置

### 第三阶段：执行引擎（2-3天）

10. 实现模板变量替换引擎（`{{变量名}}` 语法）
11. 实现工作流拓扑排序和顺序执行
12. 实现 Prompt 节点 → LLM API 调用
13. 实现 Tool 节点 → 内置工具执行
14. 实现 If 节点 → 条件判断分支选择

### 第四阶段：日志与调试（1-2天）

15. 实现执行日志收集
16. 实现底部日志面板，展示节点执行详情
17. 实现节点运行时状态高亮（正在执行/成功/失败）
18. 加载内置示例工作流

---

## 内置示例工作流

项目内置一个"智能客服"示例，用户打开即可体验：

```
Start → 提取意图(Prompt) → 判断意图(If)
                              ├── 包含退款 → 处理退款(Tool) → 生成回复(Prompt) → End
                              └── 其他     → 通用回复(Prompt) → End
```

这个示例覆盖了所有节点类型：
- **Start/End**：流程边界
- **Prompt**：调用 LLM 提取意图和生成回复
- **Tool**：执行本地工具处理退款
- **If**：条件判断走不同分支

---

## 开发约束

```
纯前端：不引入后端服务框架
轻量依赖：核心依赖仅 ReactFlow + Zustand + Ant Design
单文件引擎：执行引擎代码控制在 200 行以内
API Key 安全：仅存 localStorage，不硬编码，不上传
无数据库：工作流定义存 localStorage JSON
```

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| CORS 限制浏览器直接调 LLM API | 无法调用 | Vite proxy 代理解决 |
| ReactFlow 学习曲线 | 开发慢 | 参考 ReactFlow 官方示例 |
| 变量作用域混乱 | 执行结果错误 | 统一变量池 + 模板替换 |
| API Key 泄露 | 安全问题 | 仅存本地，提供清除功能 |

---

## 验收标准

```
[ ] 能从左侧面板拖拽节点到画布
[ ] 能在画布上连线，定义执行顺序
[ ] Prompt 节点能调用 LLM 并返回结果
[ ] Tool 节点能执行内置工具
[ ] If 节点能根据条件走不同分支
[ ] 底部面板能看到每个节点的执行日志
[ ] 能保存/加载工作流
[ ] 内置一个可直接运行的示例工作流
```
