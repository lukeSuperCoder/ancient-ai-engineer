# 08 - Mini Dify Workflow Builder

---

## 什么是 Dify

[Dify](https://dify.ai/) 是一个开源的 AI 应用开发平台，其中最核心的功能是 **Workflow Builder（工作流构建器）**——一个可视化的、拖拽式的 AI 工作流编辑器。

本节我们要理解 Dify Workflow 的设计原理，并实现一个简化版。

---

## Dify Workflow 的核心概念

### 节点类型

```
Dify 支持的节点类型：

1. LLM 节点    → 调用大模型生成文本
2. Tool 节点    → 调用外部工具（搜索、API等）
3. If/Else 节点 → 条件判断，分流
4. Variable 节点 → 定义/修改变量
5. Code 节点    → 执行自定义代码
6. Start 节点   → 流程入口
7. End 节点     → 流程出口
```

### 可视化编辑器

```
用户在画布上拖拽节点、连线，定义工作流：

  ┌──────────┐
  │  Start   │
  └────┬─────┘
       │
  ┌────▼─────┐
  │   LLM    │  ← 提取用户意图
  └────┬─────┘
       │
  ┌────▼─────┐
  │ If/Else  │  ← 判断意图类型
  └──┬────┬──┘
     │    │
  ┌──▼─┐ ┌▼───┐
  │LLM │ │Tool│  ← 不同类型走不同分支
  │客服│ │搜索│
  └──┬─┘ └─┬──┘
     │      │
  ┌──▼──────▼─┐
  │    End     │
  └────────────┘
```

---

## 技术选型

```
前端：
  - React + TypeScript
  - ReactFlow（拖拽画布）
  - Zustand（状态管理）

后端：
  - Python + FastAPI
  - Workflow 执行引擎
```

---

## 实战：实现核心功能

### 第1步：定义节点数据结构

```typescript
// 节点类型枚举
enum NodeType {
  Start = 'start',
  End = 'end',
  LLM = 'llm',
  Tool = 'tool',
  IfElse = 'if_else',
  Code = 'code',
}

// 节点定义
interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, any>;  // 节点特有的配置
  };
}

// 各类型节点的 config
interface LLMConfig {
  model: string;
  systemPrompt: string;
  temperature: number;
}

interface ToolConfig {
  toolName: string;
  parameters: Record<string, any>;
}

interface IfElseConfig {
  condition: string;    // 条件表达式
  variableName: string; // 要判断的变量
}

// 边（连线）
interface WorkflowEdge {
  id: string;
  source: string;       // 起始节点 ID
  target: string;       // 目标节点 ID
  sourceHandle?: string; // 输出端口（用于 IfElse 的 true/false）
}
```

### 第2步：后端执行引擎

```python
# workflow_engine.py

from typing import Any
from enum import Enum

class NodeType(Enum):
    START = "start"
    END = "end"
    LLM = "llm"
    TOOL = "tool"
    IF_ELSE = "if_else"
    CODE = "code"

class WorkflowEngine:
    """Workflow 执行引擎"""

    def __init__(self):
        self.nodes = {}       # node_id → node_config
        self.edges = {}       # node_id → [edges]
        self.variables = {}   # 工作流变量

    def load_workflow(self, workflow_data: dict):
        """加载工作流定义"""
        for node in workflow_data["nodes"]:
            self.nodes[node["id"]] = node
            self.edges[node["id"]] = []

        for edge in workflow_data["edges"]:
            self.edges[edge["source"]].append(edge)

    def execute(self, input_data: dict) -> dict:
        """执行工作流"""
        self.variables = {"input": input_data}

        # 找到 Start 节点
        start_node = self._find_start_node()
        if not start_node:
            raise ValueError("没有 Start 节点")

        # 从 Start 开始执行
        current_id = start_node["id"]

        while current_id:
            node = self.nodes[current_id]

            # 执行节点
            result = self._execute_node(node)

            # 找下一个节点
            current_id = self._get_next_node(current_id, result)

        return self.variables.get("output", {})

    def _execute_node(self, node: dict) -> Any:
        """执行单个节点"""
        node_type = node["type"]
        config = node["data"]["config"]

        if node_type == NodeType.START.value:
            return None

        elif node_type == NodeType.END.value:
            self.variables["output"] = self.variables
            return None

        elif node_type == NodeType.LLM.value:
            return self._execute_llm(config)

        elif node_type == NodeType.TOOL.value:
            return self._execute_tool(config)

        elif node_type == NodeType.IF_ELSE.value:
            return self._execute_if_else(config)

        elif node_type == NodeType.CODE.value:
            return self._execute_code(config)

    def _execute_llm(self, config: dict) -> str:
        """执行 LLM 节点"""
        system_prompt = config.get("systemPrompt", "")
        # 将变量替换到 prompt 中
        prompt = self._replace_variables(config.get("userPrompt", ""))

        response = llm.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            model=config.get("model", "gpt-4"),
            temperature=config.get("temperature", 0.7)
        )

        # 保存结果到变量
        output_var = config.get("outputVariable", "llm_output")
        self.variables[output_var] = response

        return response

    def _execute_tool(self, config: dict) -> Any:
        """执行 Tool 节点"""
        tool_name = config["toolName"]
        params = self._replace_variables(config.get("parameters", {}))

        result = execute_tool(tool_name, params)

        output_var = config.get("outputVariable", "tool_output")
        self.variables[output_var] = result

        return result

    def _execute_if_else(self, config: dict) -> str:
        """执行条件判断节点，返回 'true' 或 'false'"""
        variable_name = config.get("variableName", "")
        condition = config.get("condition", "")

        value = self.variables.get(variable_name, "")

        # 简单条件判断
        if condition == "contains":
            result = str(config.get("value", "")) in str(value)
        elif condition == "equals":
            result = str(value) == str(config.get("value", ""))
        elif condition == "not_empty":
            result = bool(value)
        else:
            result = bool(value)

        return "true" if result else "false"

    def _execute_code(self, config: dict) -> Any:
        """执行代码节点"""
        code = config.get("code", "")
        # 安全执行（实际项目中需要沙箱）
        local_vars = dict(self.variables)
        exec(code, {}, local_vars)
        self.variables.update(local_vars)
        return local_vars

    def _get_next_node(self, current_id: str, result: Any) -> str | None:
        """找到下一个要执行的节点"""
        edges = self.edges.get(current_id, [])

        if not edges:
            return None

        # IfElse 节点根据结果选择分支
        for edge in edges:
            source_handle = edge.get("sourceHandle")

            if source_handle is None:
                # 普通边，直接走
                return edge["target"]

            if source_handle == result:
                # 条件边，匹配结果
                return edge["target"]

        # 默认走第一条边
        return edges[0]["target"] if edges else None

    def _find_start_node(self) -> dict | None:
        for node in self.nodes.values():
            if node["type"] == NodeType.START.value:
                return node
        return None

    def _replace_variables(self, text: Any) -> Any:
        """替换变量引用 {{variable_name}}"""
        if isinstance(text, str):
            for key, value in self.variables.items():
                text = text.replace(f"{{{{{key}}}}}", str(value))
            return text
        elif isinstance(text, dict):
            return {k: self._replace_variables(v) for k, v in text.items()}
        return text
```

### 第3步：定义一个工作流

```python
# 示例：智能客服工作流

workflow = {
    "nodes": [
        {
            "id": "start",
            "type": "start",
            "position": {"x": 100, "y": 100},
            "data": {"label": "开始", "config": {}}
        },
        {
            "id": "extract_intent",
            "type": "llm",
            "position": {"x": 300, "y": 100},
            "data": {
                "label": "提取意图",
                "config": {
                    "model": "gpt-4",
                    "systemPrompt": "你是一个意图分析器。分析用户输入，返回意图类别。",
                    "userPrompt": "分析以下用户输入的意图：{{input.message}}",
                    "outputVariable": "intent"
                }
            }
        },
        {
            "id": "check_intent",
            "type": "if_else",
            "position": {"x": 500, "y": 100},
            "data": {
                "label": "判断意图",
                "config": {
                    "variableName": "intent",
                    "condition": "contains",
                    "value": "退款"
                }
            }
        },
        {
            "id": "handle_refund",
            "type": "tool",
            "position": {"x": 700, "y": 50},
            "data": {
                "label": "处理退款",
                "config": {
                    "toolName": "process_refund",
                    "parameters": {"reason": "{{intent}}"},
                    "outputVariable": "refund_result"
                }
            }
        },
        {
            "id": "general_reply",
            "type": "llm",
            "position": {"x": 700, "y": 200},
            "data": {
                "label": "通用回复",
                "config": {
                    "model": "gpt-4",
                    "systemPrompt": "你是一个客服，回答用户问题。",
                    "userPrompt": "用户说：{{input.message}}",
                    "outputVariable": "reply"
                }
            }
        },
        {
            "id": "end",
            "type": "end",
            "position": {"x": 900, "y": 100},
            "data": {"label": "结束", "config": {}}
        }
    ],
    "edges": [
        {"id": "e1", "source": "start", "target": "extract_intent"},
        {"id": "e2", "source": "extract_intent", "target": "check_intent"},
        {"id": "e3", "source": "check_intent", "target": "handle_refund",
         "sourceHandle": "true"},
        {"id": "e4", "source": "check_intent", "target": "general_reply",
         "sourceHandle": "false"},
        {"id": "e5", "source": "handle_refund", "target": "end"},
        {"id": "e6", "source": "general_reply", "target": "end"}
    ]
}

# 执行
engine = WorkflowEngine()
engine.load_workflow(workflow)
result = engine.execute({"message": "我要退款，东西不好"})
```

---

## 前端画布（概念设计）

使用 ReactFlow 实现拖拽画布的核心思路：

```typescript
// 自定义节点组件
function LLMNode({ data }: { data: NodeData }) {
  return (
    <div className="llm-node">
      <div className="node-header">LLM</div>
      <div className="node-body">
        <div>模型：{data.config.model}</div>
        <div>温度：{data.config.temperature}</div>
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// IfElse 节点（两个输出端口）
function IfElseNode({ data }: { data: NodeData }) {
  return (
    <div className="if-else-node">
      <div className="node-header">If/Else</div>
      <div className="node-body">{data.config.condition}</div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} id="true"
              style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="false"
              style={{ left: '70%' }} />
    </div>
  );
}

// 主画布
function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = {
    llm: LLMNode,
    tool: ToolNode,
    if_else: IfElseNode,
    start: StartNode,
    end: EndNode,
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
    />
  );
}
```

---

## 学完本节你应该能回答

```
1. Dify 的 Workflow 核心节点类型有哪些？
2. Workflow 执行引擎的基本流程是什么？
3. IfElse 节点如何实现条件分支？
4. 变量在节点间如何传递？
5. 前端可视化编辑器的技术选型是什么？
```

---

## 阶段四总结

学完这8篇文档，你应该掌握了：

```
Agent 部分：
  ✅ Agent 的本质：LLM + 循环 + 工具 + 自主决策
  ✅ ReAct 模式：Thought → Action → Observation
  ✅ Planner-Executor：先规划再执行
  ✅ Reflection：自我评估和改进
  ✅ Agent Memory：短期/工作/长期记忆

Workflow 部分：
  ✅ DAG：有向无环图，描述数据流水线
  ✅ 状态机：描述业务流程
  ✅ 节点调度：顺序/并行/拓扑排序
  ✅ 条件流转：if/else 分支

框架实战：
  ✅ LangGraph：Node + Edge + State + Checkpoint
  ✅ Multi-Agent：串行/路由/协作/辩论模式
  ✅ Mini Dify：可视化 Workflow Builder
```

面试高频问题：

```
1. Agent 和 Workflow 的区别？
2. ReAct 模式如何工作？
3. 为什么 Agent 容易失控？
4. DAG 和状态机的区别？
5. Multi-Agent 的架构模式？
```
