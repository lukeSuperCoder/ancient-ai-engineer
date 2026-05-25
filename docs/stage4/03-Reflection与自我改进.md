# 03 - Reflection 与自我改进

---

## 回顾：前两种模式的问题

```
ReAct：
  走一步看一步 → 可能走偏、效率低

Planner-Executor：
  先规划再执行 → 计划可能不好，执行了才发现
```

**共同问题**：执行完就完了，没有回头审视"做得好不好"。

---

## Reflection 是什么

> **让 Agent 在执行后自我评估，发现问题并改进。**

生活类比：
```
没有 Reflection：
  写完作业直接交 → 可能有很多错误

有 Reflection：
  写完作业 → 自己检查一遍 → 发现错误 → 修改 → 再检查 → 确认没问题 → 交
```

---

## Reflection 的三种模式

### 1. 简单反思（Self-Reflection）

执行完一个步骤后，让 AI 检查自己的输出：

```python
REFLECT_PROMPT = """你刚刚完成了以下任务：

任务：{task}
你的输出：{output}

请评估：
1. 输出是否完整回答了任务？
2. 是否有错误或不准确之处？
3. 是否遗漏了重要信息？

评估结果（good/bad）和改进建议："""

def execute_with_reflection(task):
    # 第1步：执行
    output = llm.chat(f"完成以下任务：{task}")

    # 第2步：反思
    reflection = llm.chat(REFLECT_PROMPT.format(
        task=task, output=output
    ))

    # 第3步：如果反思发现问题，改进
    if "bad" in reflection:
        improved = llm.chat(f"""
        原始任务：{task}
        原始输出：{output}
        改进建议：{reflection}

        请根据改进建议重新完成任务。
        """)
        return improved

    return output
```

### 2. Reflexion 模式

更系统化的反思——保留历史反思经验：

```
第1次尝试：
  执行任务 → 输出结果
  ↓
  反思：发现了3个问题
  ↓

第2次尝试（带着反思经验）：
  执行任务 → 输出结果
  ↓
  反思：发现了1个问题（比上次好）
  ↓

第3次尝试：
  执行任务 → 输出结果
  ↓
  反思：没有问题了 ✓
  ↓

  最终输出
```

```python
class ReflexionAgent:
    def __init__(self):
        self.reflections = []  # 积累的反思经验

    def run(self, task, max_attempts=3):
        for attempt in range(max_attempts):
            # 执行（带上历史反思经验）
            output = self.execute(task)

            # 评估
            score = self.evaluate(task, output)

            if score >= 0.8:  # 足够好了
                return output

            # 反思（找出问题）
            reflection = self.reflect(task, output, score)
            self.reflections.append(reflection)

        return output  # 达到最大尝试次数，返回最后的输出

    def execute(self, task):
        """执行任务，带上历史反思"""
        context = ""
        if self.reflections:
            context = f"""
            历史反思（避免重复犯错）：
            {chr(10).join(self.reflections)}
            """

        return llm.chat(f"{context}\n任务：{task}")

    def evaluate(self, task, output):
        """评估输出质量"""
        response = llm.chat(f"""
        评估以下输出的质量（0-1分）：

        任务：{task}
        输出：{output}

        只返回一个0到1之间的数字。
        """)
        return float(response)

    def reflect(self, task, output, score):
        """反思并总结问题"""
        return llm.chat(f"""
        任务：{task}
        输出：{output}
        得分：{score}

        请分析输出中存在的问题，给出具体的改进建议。
        """)
```

### 3. 外部反馈（External Feedback）

除了自我评估，还可以引入外部评估：

```
AI 输出 → 人类评估 → 反馈 → AI 改进
AI 输出 → 测试用例 → 通过/失败 → AI 修改
AI 输出 → 工具验证 → 结果 → AI 调整
```

最常见的场景——**代码 Agent**：
```python
def code_agent_with_feedback(task):
    # AI 写代码
    code = llm.chat(f"写代码完成：{task}")

    # 运行测试验证
    test_result = run_tests(code)

    if test_result["passed"]:
        return code

    # 测试没通过，让 AI 根据错误信息修改
    improved = llm.chat(f"""
    你的代码测试没通过：

    代码：{code}
    错误信息：{test_result['errors']}

    请修改代码修复这些问题。
    """)

    return improved
```

---

## Reflection 的适用场景

```
✅ 适合：
  - 代码生成（可以运行验证）
  - 文案写作（可以评估质量）
  - 数据分析（可以检查逻辑）
  - 复杂推理（可以验证结论）

❌ 不适合：
  - 简单问答（一次就够了）
  - 实时交互（没时间反思）
  - 成本敏感（反思 = 更多 API 调用）
```

---

## Reflection 的代价

```
优点：
  + 输出质量更高
  + 可以发现并修复错误
  + 积累经验避免重复犯错

缺点：
  - 更多 API 调用 = 更多成本
  - 执行时间更长
  - 不一定每次都能发现问题
```

### 实际建议

```
1. 不是所有任务都需要 Reflection
2. 对质量要求高的任务才启用
3. 限制最大反思次数（通常 2-3 次）
4. 设置明确的评估标准
```

---

## 三种 Agent 模式总结

```
ReAct
  适用：简单任务、需要灵活应对
  特点：边思考边行动
  缺点：缺乏全局规划

Planner-Executor
  适用：复杂多步任务
  特点：先规划再执行
  缺点：计划可能不好

Reflection
  适用：对质量要求高的任务
  特点：执行后自我评估改进
  缺点：成本高、耗时长
```

### 组合使用

```
实际项目中，通常组合使用：

方案A：Planner-Executor + Reflection
  先规划 → 执行 → 反思 → 改进

方案B：ReAct + 工作记忆
  边做边想 → 记住中间结果 → 提高效率

方案C：Planner-Executor + ReAct
  先规划大方向 → 每个步骤内部用 ReAct 灵活执行
```

---

## 学完本节你应该能回答

```
1. Reflection 解决了什么问题？
2. Self-Reflection 和 Reflexion 的区别？
3. 什么场景适合用 Reflection？
4. Reflection 的代价是什么？
5. 三种 Agent 模式如何组合使用？
```

---

## 下一节

[04-Workflow 基础：DAG 与状态机](./04-Workflow基础-DAG与状态机.md) →
