# 04 - Workflow 基础：DAG 与状态机

---

## Agent vs Workflow

先明确两者的区别：

```
Agent（智能体）：
  AI 自己决定每一步做什么
  → 灵活，但不可控
  → 适合探索性任务

Workflow（工作流）：
  人类预先定义好执行路径
  → 可控，但不够灵活
  → 适合确定性任务
```

### 生活类比

```
Agent：
  你告诉司机"带我去机场"
  → 司机自己选路线
  → 遇到堵车自己绕路

Workflow：
  你给司机一张路线图
  → 司机按路线走
  → 到了路口按指示左转/右转
```

### 实际应用中

```
大多数 AI 产品 = Agent + Workflow 混合

例：客服系统
  Workflow 部分：
    用户进来 → 意图识别 → 分流到不同处理流程

  Agent 部分：
    具体流程中的某些步骤由 AI 自主处理
```

---

## DAG（有向无环图）

### 什么是 DAG

DAG = **D**irected **A**cyclic **G**raph

- **Directed**（有向）：节点之间有方向
- **Acyclic**（无环）：不能形成环（A→B→C→A 不行）
- **Graph**（图）：由节点和边组成

### 为什么 Workflow 用 DAG

因为任务有**依赖关系**：

```
"做饭"这个任务：

  买菜 → 洗菜 → 切菜 → 炒菜 → 装盘

  这是一个线性的 DAG：
  [买菜] → [洗菜] → [切菜] → [炒菜] → [装盘]
```

更复杂的：
```
"准备晚宴"：

       [买菜]
      /       \
  [洗菜]    [准备调料]
     |         |
  [切菜]       |
     \        /
     [炒菜]
        |
     [装盘]
```

规则：
- 每个节点是一个任务步骤
- 箭头表示"完成这个才能开始下一个"
- 不能有环（不能切完菜又回去买菜）

### DAG 的代码表示

```python
class DAGNode:
    """DAG 的节点"""
    def __init__(self, name, handler):
        self.name = name
        self.handler = handler    # 处理函数
        self.children = []        # 下游节点
        self.parents = []         # 上游节点

    def add_child(self, child):
        self.children.append(child)
        child.parents.append(self)

class DAG:
    """有向无环图"""
    def __init__(self):
        self.nodes = {}

    def add_node(self, name, handler):
        node = DAGNode(name, handler)
        self.nodes[name] = node
        return node

    def add_edge(self, from_name, to_name):
        """添加边：from_name → to_name"""
        self.nodes[from_name].add_child(self.nodes[to_name])

    def validate(self):
        """检查是否有环"""
        visited = set()
        stack = set()

        def dfs(node_name):
            if node_name in stack:
                return False  # 有环！
            if node_name in visited:
                return True

            visited.add(node_name)
            stack.add(node_name)

            for child in self.nodes[node_name].children:
                if not dfs(child.name):
                    return False

            stack.remove(node_name)
            return True

        return all(dfs(name) for name in self.nodes)
```

### DAG 的执行

```python
def execute_dag(dag, initial_input):
    """执行 DAG"""
    results = {}
    executed = set()

    def execute_node(node_name):
        if node_name in executed:
            return

        # 确保所有上游节点已执行
        for parent in dag.nodes[node_name].parents:
            execute_node(parent.name)

        # 收集上游节点的输出作为输入
        inputs = {
            parent.name: results[parent.name]
            for parent in dag.nodes[node_name].parents
        }

        # 执行当前节点
        node = dag.nodes[node_name]
        result = node.handler(inputs)
        results[node_name] = result
        executed.add(node_name)

    # 从所有节点开始执行（会自动处理依赖）
    for name in dag.nodes:
        execute_node(name)

    return results
```

### 使用示例

```python
# 构建一个简单的 AI 文档处理 DAG
dag = DAG()

dag.add_node("load_doc", handler=load_document)
dag.add_node("extract_text", handler=extract_text)
dag.add_node("translate", handler=translate_text)
dag.add_node("summarize", handler=summarize_text)
dag.add_node("output", handler=format_output)

dag.add_edge("load_doc", "extract_text")
dag.add_edge("extract_text", "translate")
dag.add_edge("extract_text", "summarize")
dag.add_edge("translate", "output")
dag.add_edge("summarize", "output")

# 执行
results = execute_dag(dag, {"file": "report.pdf"})
```

对应的流程图：
```
[load_doc] → [extract_text] → [translate] → [output]
                              ↘ [summarize] ↗
```

---

## 状态机（State Machine）

### 什么是状态机

状态机是另一种描述流程的方式：

> **系统在任意时刻处于一个确定的状态，在特定条件下从一个状态转换到另一个状态。**

### 类比理解

```
红绿灯就是一个状态机：

  [红灯] → (30秒后) → [绿灯] → (25秒后) → [黄灯] → (5秒后) → [红灯]
```

### 状态机的要素

```
1. 状态（State）：系统当前的情况
2. 转换（Transition）：从一个状态到另一个状态
3. 事件/条件（Event/Condition）：触发转换的原因
4. 动作（Action）：转换时执行的操作
```

### 在 AI Workflow 中的应用

```python
class State:
    """状态定义"""
    def __init__(self, name):
        self.name = name
        self.transitions = {}  # event → next_state

    def add_transition(self, event, next_state, action=None):
        self.transitions[event] = {
            "next_state": next_state,
            "action": action
        }

class StateMachine:
    """状态机"""
    def __init__(self, initial_state):
        self.current_state = initial_state
        self.states = {}
        self.context = {}  # 共享数据

    def add_state(self, state):
        self.states[state.name] = state

    def trigger(self, event):
        """触发一个事件"""
        state = self.states[self.current_state]

        if event not in state.transitions:
            raise ValueError(f"状态 {state.name} 不支持事件 {event}")

        transition = state.transitions[event]

        # 执行动作
        if transition["action"]:
            transition["action"](self.context)

        # 转换状态
        self.current_state = transition["next_state"].name
```

### 实际示例：文档审批流程

```python
# 定义状态
draft = State("draft")
review = State("review")
approved = State("approved")
rejected = State("rejected")
published = State("published")

# 定义转换
draft.add_transition("submit", review, action=lambda ctx: ctx.update({"submitted_at": now()}))
review.add_transition("approve", approved, action=lambda ctx: ctx.update({"approved_at": now()}))
review.add_transition("reject", rejected, action=lambda ctx: ctx.update({"rejected_at": now()}))
rejected.add_transition("revise", draft)
approved.add_transition("publish", published, action=lambda ctx: publish_doc(ctx))

# 创建状态机
sm = StateMachine(draft)
sm.add_state(draft)
sm.add_state(review)
sm.add_state(approved)
sm.add_state(rejected)
sm.add_state(published)

# 使用
sm.trigger("submit")    # draft → review
sm.trigger("approve")   # review → approved
sm.trigger("publish")   # approved → published
```

流程可视化：
```
[draft] --submit--> [review] --approve--> [approved] --publish--> [published]
                        |
                     reject
                        ↓
                    [rejected] --revise--> [draft]
```

---

## DAG vs 状态机

| 维度 | DAG | 状态机 |
|------|-----|--------|
| 结构 | 图（有分支） | 状态网络 |
| 方向 | 单向，无环 | 可以来回 |
| 适用 | 数据处理流水线 | 业务流程管理 |
| 并行 | 支持并行执行 | 通常串行 |
| 环 | 不允许 | 允许（如打回修改） |

### 怎么选？

```
数据处理、AI Pipeline → DAG
  例：文档 → 提取 → 翻译 + 摘要 → 合并输出

业务流程、审批流 → 状态机
  例：提交 → 审核 → 通过/驳回 → 发布

复杂系统 → 两者结合
  例：状态机管理整体流程，每个状态内部用 DAG 执行
```

---

## 学完本节你应该能回答

```
1. Agent 和 Workflow 的本质区别是什么？
2. DAG 是什么？为什么不能有环？
3. 状态机的四个要素是什么？
4. DAG 和状态机分别适合什么场景？
5. 实际项目中两者如何结合？
```

---

## 下一节

[05-节点调度与条件流转](./05-节点调度与条件流转.md) →
