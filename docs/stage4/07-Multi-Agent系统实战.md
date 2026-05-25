# 07 - Multi-Agent 系统实战

---

## 为什么需要多个 Agent

单个 Agent 什么都能做，但：
```
1. Prompt 太长 → 容易遗忘和混乱
2. 任务太复杂 → 容易失控
3. 角色冲突   → 既当研究者又当写作者，质量不好
```

Multi-Agent 的思路：**让不同的 Agent 做不同的事，协同完成复杂任务。**

### 类比理解

```
单 Agent：
  一个人同时做：调研 + 写作 + 编辑 + 排版
  → 效率低，质量差

Multi-Agent：
  调研员负责调研
  写作者负责写作
  编辑负责审核
  → 分工明确，各司其职
```

---

## Multi-Agent 的架构模式

### 1. 串行模式（Pipeline）

```
用户输入 → [Agent A] → [Agent B] → [Agent C] → 输出
```

每个 Agent 处理上一步的结果：

```python
def pipeline_agents(task, agents):
    """串行执行多个 Agent"""
    result = task

    for agent in agents:
        result = agent.run(result)

    return result

# 使用
agents = [
    ResearchAgent(),    # 调研
    WriterAgent(),      # 写作
    EditorAgent(),      # 编辑
]

report = pipeline_agents("写一份AI行业报告", agents)
```

### 2. 路由模式（Router）

```
用户输入 → [Router Agent] → 判断类型 → 分发到不同专业 Agent
                                    ├→ [客服 Agent]
                                    ├→ [技术 Agent]
                                    └→ [销售 Agent]
```

```python
class RouterAgent:
    """路由 Agent：分析意图，分发到专业 Agent"""

    def __init__(self):
        self.specialists = {
            "customer_service": CustomerServiceAgent(),
            "technical": TechnicalAgent(),
            "sales": SalesAgent(),
        }

    def run(self, user_input):
        # 1. 分析意图
        intent = self.analyze_intent(user_input)

        # 2. 路由到专业 Agent
        specialist = self.specialists[intent]
        return specialist.run(user_input)

    def analyze_intent(self, text):
        prompt = f"""分析用户意图，返回类别：
        - customer_service：退款、投诉、售后
        - technical：技术问题、Bug、使用帮助
        - sales：价格、购买、合作

        用户输入：{text}

        只返回类别名称。"""
        return llm.chat(prompt).strip().lower()
```

### 3. 协作模式（Collaborative）

```
        ┌→ [搜索 Agent] → 搜索结果 ─┐
        │                             │
用户 → [协调 Agent] ──────────────→ [写作 Agent] → 输出
        │                             │
        └→ [分析 Agent] → 分析结果 ─┘
```

一个**协调者（Orchestrator）**管理多个专业 Agent：

```python
class Orchestrator:
    """协调者：分配任务、收集结果"""

    def __init__(self):
        self.agents = {
            "searcher": SearchAgent(),
            "analyzer": AnalyzeAgent(),
            "writer": WriterAgent(),
        }

    def run(self, task):
        # 1. 搜索 Agent 收集信息
        search_result = self.agents["searcher"].run(task)

        # 2. 分析 Agent 分析搜索结果
        analysis = self.agents["analyzer"].run(search_result)

        # 3. 写作 Agent 基于搜索和分析写报告
        report = self.agents["writer"].run({
            "task": task,
            "search": search_result,
            "analysis": analysis
        })

        return report
```

### 4. 辩论模式（Debate）

```
[Agent A（正方）] ⇄ [Agent B（反方）] → [Agent C（裁判）] → 最终结论
```

```python
class DebateSystem:
    """辩论系统：通过正反方辩论得到更好的结论"""

    def __init__(self):
        self.proposer = Agent(role="正方：支持这个观点")
        self.opponent = Agent(role="反方：反对这个观点")
        self.judge = Agent(role="裁判：综合双方观点给出最终结论")

    def run(self, topic, rounds=3):
        debate_history = []

        for i in range(rounds):
            # 正方发言
            pro_arg = self.proposer.run(
                f"辩题：{topic}\n历史：{debate_history}\n请提出你的论点。"
            )
            debate_history.append(f"正方：{pro_arg}")

            # 反方反驳
            con_arg = self.opponent.run(
                f"辩题：{topic}\n历史：{debate_history}\n请反驳对方观点。"
            )
            debate_history.append(f"反方：{con_arg}")

        # 裁判总结
        final = self.judge.run(
            f"辩题：{topic}\n辩论记录：{debate_history}\n请给出最终结论。"
        )

        return final
```

---

## Agent 间的通信

### 方式 1：直接传参

```python
# 最简单的方式
result_a = agent_a.run(task)
result_b = agent_b.run(result_a)  # A 的输出作为 B 的输入
```

### 方式 2：共享状态

```python
class SharedState:
    """多个 Agent 共享的状态"""
    def __init__(self):
        self.data = {}
        self.lock = threading.Lock()

    def update(self, key, value):
        with self.lock:
            self.data[key] = value

    def get(self, key):
        return self.data.get(key)

# 使用
state = SharedState()

# Agent A 写入
agent_a.run(state)   # A 把搜索结果写入 state["search_results"]

# Agent B 读取
agent_b.run(state)   # B 从 state 读取搜索结果，进行分析
```

### 方式 3：消息队列

```python
from queue import Queue

class MessageBus:
    """Agent 间的消息总线"""
    def __init__(self):
        self.channels = {}

    def register(self, agent_name):
        self.channels[agent_name] = Queue()

    def send(self, from_agent, to_agent, message):
        self.channels[to_agent].put({
            "from": from_agent,
            "data": message
        })

    def receive(self, agent_name):
        return self.channels[agent_name].get()

# 使用
bus = MessageBus()
bus.register("researcher")
bus.register("writer")

# 研究者发送消息给写作者
bus.send("researcher", "writer", {"findings": "..."})

# 写作者接收
message = bus.receive("writer")
```

---

## 实战：构建一个研究团队

```python
class ResearchTeam:
    """多 Agent 研究团队"""

    def __init__(self):
        # 角色定义
        self.router = Agent(
            name="路由员",
            system_prompt="你负责分析用户的研究需求，拆解为子任务。"
        )
        self.searcher = Agent(
            name="搜索员",
            system_prompt="你负责搜索和收集信息。使用 search 工具。"
        )
        self.analyst = Agent(
            name="分析师",
            system_prompt="你负责分析数据，发现趋势和规律。"
        )
        self.writer = Agent(
            name="写作者",
            system_prompt="你负责将研究结果整理成报告。"
        )

    def run(self, research_topic):
        # Step 1: 路由员拆解任务
        subtasks = self.router.run(f"""
        请将以下研究任务拆解为3-5个子任务：
        {research_topic}

        每个子任务要明确：
        - 要搜索什么
        - 要分析什么
        """)

        # Step 2: 搜索员逐个搜索
        search_results = []
        for task in parse_subtasks(subtasks):
            result = self.searcher.run(task)
            search_results.append(result)

        # Step 3: 分析师分析
        analysis = self.analyst.run(f"""
        以下是关于"{research_topic}"的搜索结果：
        {format_results(search_results)}

        请分析关键发现和趋势。
        """)

        # Step 4: 写作者整理报告
        report = self.writer.run(f"""
        研究主题：{research_topic}

        搜索结果：{format_results(search_results)}

        分析结论：{analysis}

        请撰写一份完整的研究报告，包含：
        1. 摘要
        2. 关键发现
        3. 趋势分析
        4. 结论和建议
        """)

        return report


# 使用
team = ResearchTeam()
report = team.run("2024年AI编程工具发展趋势")
```

---

## Multi-Agent 的挑战

```
1. 成本高
   - 每个 Agent 都要调用 LLM
   - 4个 Agent = 4倍成本
   - 解决：控制 Agent 数量，优化 Prompt

2. 延迟高
   - 串行 Agent 累积延迟
   - 解决：并行执行独立任务

3. 一致性
   - 不同 Agent 可能给出矛盾信息
   - 解决：共享上下文，加仲裁机制

4. 调试难
   - 多个 Agent 交互，问题难定位
   - 解决：完善的日志系统
```

---

## 学完本节你应该能回答

```
1. Multi-Agent 的四种架构模式是什么？
2. Router 模式适合什么场景？
3. Agent 之间如何通信？
4. Multi-Agent 的主要挑战有哪些？
5. 如何控制 Multi-Agent 的成本？
```

---

## 下一节

[08-Mini Dify Workflow Builder](./08-MiniDify-Workflow-Builder.md) →
