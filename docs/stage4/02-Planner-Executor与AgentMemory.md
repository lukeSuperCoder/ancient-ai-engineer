# 02 - Planner-Executor 与 Agent Memory

---

## 回顾：ReAct 的局限

ReAct 模式很好用，但有一个问题：

> **Agent 每次只看当前这一步，缺乏全局规划。**

举个例子：
```
用户任务：帮我调研"2024年AI行业发展趋势"并写一份报告

ReAct Agent 可能这样：
  Step 1: 搜索"AI发展趋势" → 得到一些结果
  Step 2: 搜索"AI行业报告" → 得到更多结果
  Step 3: 发现漏了"AI应用" → 再搜
  Step 4: 又发现漏了"AI投资" → 再搜
  ... 来来回回，效率很低
```

问题在于：Agent 没有先**规划**，而是走一步看一步。

---

## Planner-Executor 模式

### 核心思想

> **先规划，再执行。**

把任务分成两个阶段：
1. **Planner（规划器）**：分析任务，制定完整的执行计划
2. **Executor（执行器）**：按照计划逐步执行

### 类比理解

```
ReAct：
  像一个人到一个新城市旅游，走一步看一步，容易迷路

Planner-Executor：
  像一个有经验的导游，先规划好路线（Plan），
  然后按路线走（Execute），
  如果遇到问题可以调整路线（Replan）
```

### 工作流程

```
用户任务
    ↓
┌─────────────┐
│   Planner    │  ← LLM 分析任务，生成步骤列表
└──────┬──────┘
       ↓
  ┌────────────┐
  │  Step 1    │ ← "搜索AI行业最新报告"
  │  Step 2    │ ← "搜索AI投资数据"
  │  Step 3    │ ← "搜索AI应用案例"
  │  Step 4    │ ← "整理关键发现"
  │  Step 5    │ ← "撰写报告"
  └─────┬──────┘
        ↓
┌──────────────┐
│   Executor   │  ← 逐步执行每个步骤
└──────────────┘
        ↓
    最终结果
```

### 代码示例

```python
# Planner：生成执行计划
PLAN_PROMPT = """你是一个任务规划专家。

用户任务：{task}

请将任务拆解为具体的执行步骤，每个步骤要明确：
- 步骤描述
- 需要的工具（search / read / write / calculate）
- 预期输出

以 JSON 格式输出步骤列表。"""

def plan_task(task):
    """规划阶段：将任务拆解为步骤"""
    response = llm.chat(PLAN_PROMPT.format(task=task))
    steps = json.loads(response)
    return steps

# Executor：逐步执行
EXECUTE_PROMPT = """你正在执行一个任务的某一步。

原始任务：{task}
当前步骤：{current_step}
已完成步骤的结果：{previous_results}

请执行当前步骤，使用可用工具完成任务。"""

def execute_plan(task, steps):
    """执行阶段：按计划逐步执行"""
    results = []

    for i, step in enumerate(steps):
        response = llm.chat(EXECUTE_PROMPT.format(
            task=task,
            current_step=step,
            previous_results=results
        ))

        # 如果步骤需要调用工具
        if needs_tool(response):
            tool_result = execute_tool(response)
            results.append(f"步骤{i+1}结果：{tool_result}")
        else:
            results.append(f"步骤{i+1}结果：{response}")

    return results[-1]  # 返回最终结果

# 完整流程
def run_planner_executor(task):
    steps = plan_task(task)        # 规划
    result = execute_plan(task, steps)  # 执行
    return result
```

### ReAct vs Planner-Executor 对比

| 维度 | ReAct | Planner-Executor |
|------|-------|------------------|
| 规划能力 | 无（走一步看一步） | 有（先规划再执行） |
| 适用任务 | 简单、少步骤 | 复杂、多步骤 |
| 效率 | 可能反复搜索 | 按计划高效执行 |
| 灵活性 | 高（随时调整） | 中（需重新规划） |
| 可预测性 | 低 | 高 |

### 实际中怎么选？

```
简单任务（1-3步） → ReAct
  例："北京今天天气怎么样？"

复杂任务（5+步骤） → Planner-Executor
  例："帮我调研AI行业趋势并写报告"

最复杂任务 → Planner-Executor + 动态调整
  例：执行过程中发现计划不合理，可以重新规划
```

---

## Agent Memory（记忆）

### 为什么 Agent 需要记忆

没有记忆的 Agent：
```
用户："帮我查一下北京的天气"
Agent：[查天气] "北京今天晴天，25度"

用户："那上海呢？"
Agent：[查天气] "上海今天多云，28度"

用户："哪个更热？"
Agent：？？？ （忘了之前的结果）
```

Agent 需要在多轮交互中**记住**信息，这就是 Memory。

### 记忆的类型

```
Agent Memory
├── 短期记忆（Short-term）
│   └── 当前对话的上下文
│       例：用户刚说过的话、刚查到的结果
│
├── 长期记忆（Long-term）
│   └── 跨对话的历史信息
│       例：用户偏好、历史任务
│
└── 工作记忆（Working）
    └── 当前任务的执行状态
        例：已完成的步骤、中间结果
```

### 1. 短期记忆

最简单的记忆——把对话历史全部传给 LLM：

```python
class ShortTermMemory:
    def __init__(self):
        self.messages = []

    def add(self, role, content):
        self.messages.append({"role": role, "content": content})

    def get_context(self):
        return self.messages

# 使用
memory = ShortTermMemory()
memory.add("user", "北京天气怎么样？")
memory.add("assistant", "北京晴天，25度")
memory.add("user", "那上海呢？")

# 每次调用 LLM 都带上全部历史
response = llm.chat(memory.get_context())
# LLM 能看到之前所有对话 → 知道"那"指的是"天气"
```

**问题**：对话太长会超出 Context Window。

**解决**：总结或裁剪旧消息。

```python
def trim_memory(messages, max_tokens=4000):
    """保留最近的对话，早期对话做摘要"""
    total = count_tokens(messages)

    if total <= max_tokens:
        return messages

    # 保留 system prompt + 最近的消息
    system = [m for m in messages if m["role"] == "system"]
    recent = messages[-10:]  # 保留最近10条

    # 早期的消息做摘要
    old = messages[:-10]
    summary = llm.chat(f"请总结以下对话的关键信息：\n{old}")

    return system + [{"role": "system", "content": f"历史摘要：{summary}"}] + recent
```

### 2. 工作记忆

在 Agent 执行任务过程中，记录**中间状态**：

```python
class WorkingMemory:
    def __init__(self, task):
        self.task = task
        self.steps_completed = []
        self.current_step = None
        self.facts = []       # 收集到的事实
        self.tools_used = []   # 使用过的工具
        self.errors = []       # 遇到的错误

    def add_fact(self, fact):
        """记录发现的事实"""
        self.facts.append(fact)

    def complete_step(self, step, result):
        """记录完成的步骤"""
        self.steps_completed.append({
            "step": step,
            "result": result
        })

    def get_summary(self):
        """获取当前工作状态摘要"""
        return {
            "task": self.task,
            "completed": len(self.steps_completed),
            "facts": self.facts,
            "errors": self.errors
        }

    def get_context_for_llm(self):
        """生成给 LLM 的上下文"""
        context = f"任务：{self.task}\n"
        context += f"已完成步骤：{len(self.steps_completed)}\n"

        if self.facts:
            context += "已知信息：\n"
            for fact in self.facts:
                context += f"  - {fact}\n"

        if self.errors:
            context += "遇到的问题：\n"
            for err in self.errors:
                context += f"  - {err}\n"

        return context
```

### 3. 长期记忆

跨对话、跨任务的持久化记忆：

```python
class LongTermMemory:
    def __init__(self, db):
        self.db = db  # 可以是向量数据库

    def save(self, user_id, key, value):
        """保存用户相关的信息"""
        self.db.insert({
            "user_id": user_id,
            "key": key,
            "value": value,
            "timestamp": now()
        })

    def recall(self, user_id, query, top_k=5):
        """回忆相关的信息"""
        # 使用向量检索找最相关的记忆
        results = self.db.similarity_search(
            query=query,
            filter={"user_id": user_id},
            top_k=top_k
        )
        return results

# 使用
memory = LongTermMemory(vector_db)

# 第一次对话
memory.save("user_1", "preference", "喜欢简洁的回答")
memory.save("user_1", "context", "在做Python开发")

# 几天后再次对话
past = memory.recall("user_1", "编程偏好")
# → 返回之前保存的信息，Agent 能"记住"用户
```

### 三种记忆的配合

```python
class AgentMemory:
    """整合三种记忆"""

    def __init__(self):
        self.short_term = ShortTermMemory()    # 当前对话
        self.working = None                     # 当前任务
        self.long_term = LongTermMemory(db)     # 持久化

    def start_task(self, task):
        """开始新任务"""
        self.working = WorkingMemory(task)
        # 从长期记忆中加载相关信息
        relevant = self.long_term.recall(task)
        self.short_term.add("system", f"相关信息：{relevant}")

    def build_context(self):
        """构建完整的上下文"""
        context = self.short_term.get_context()
        if self.working:
            context += self.working.get_context_for_llm()
        return context
```

---

## 学完本节你应该能回答

```
1. Planner-Executor 模式和 ReAct 的区别是什么？
2. 什么场景适合用 Planner-Executor？
3. Agent 的三种记忆分别解决什么问题？
4. 短期记忆超出 Context Window 怎么办？
5. 工作记忆记录哪些信息？
```

---

## 下一节

[03-Reflection 与自我改进](./03-Reflection与自我改进.md) →
