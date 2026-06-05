# Token 优化与成本控制

## 为什么要关注 Token

LLM 按 Token 计费。每次调用的成本 = 输入 Token 单价 × 输入数量 + 输出 Token 单价 × 输出数量。

以 Claude 为例（参考定价，请以官网为准）：

| 模型 | 输入价格 | 输出价格 |
|------|----------|----------|
| Claude Opus | $15 / 1M tokens | $75 / 1M tokens |
| Claude Sonnet | $3 / 1M tokens | $15 / 1M tokens |
| Claude Haiku | $0.25 / 1M tokens | $1.25 / 1M tokens |

一次典型的代码问答（输入 1000 tokens，输出 500 tokens）：

- Opus：$0.015 + $0.0375 = **$0.0525**
- Sonnet：$0.003 + $0.0075 = **$0.0105**
- Haiku：$0.00025 + $0.000625 = **$0.000875**

一天 1000 次调用，月成本差距：

- Opus：~$1,575/月
- Sonnet：~$315/月
- Haiku：~$26/月

选对模型、优化 Token 用量，直接影响成本。

---

## 一、Token 优化策略

### 1.1 压缩上下文

#### 问题

多轮对话中，历史消息越来越长：

```
第 1 轮：1000 tokens
第 2 轮：2500 tokens
第 5 轮：8000 tokens
第 10 轮：20000 tokens  ← 大部分是重复信息
```

#### 解决方案：滑动窗口 + 摘要

```python
def compress_messages(messages, max_history=6, max_context_tokens=4000):
    """压缩消息历史"""
    # 策略 1：保留最近 N 条消息
    recent = messages[-max_history:]

    # 策略 2：如果仍然太长，对早期消息做摘要
    total_tokens = estimate_tokens(recent)
    if total_tokens > max_context_tokens:
        # 保留 system prompt + 最近 2 条 + 中间摘要
        system_msgs = [m for m in recent if m["role"] == "system"]
        conversation = [m for m in recent if m["role"] != "system"]

        if len(conversation) > 4:
            # 对前面的消息生成摘要
            old_messages = conversation[:-4]
            summary = generate_summary(old_messages)
            compressed = system_msgs + [
                {"role": "assistant", "content": f"[之前的对话摘要] {summary}"},
            ] + conversation[-4:]
            return compressed

    return recent


def estimate_tokens(messages):
    """粗略估算 Token 数（1 个中文字 ≈ 2 tokens，1 个英文单词 ≈ 1.3 tokens）"""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        # 粗略估算：字符数 / 2
        total += len(content) / 2
    return int(total)


def generate_summary(messages):
    """用小模型对历史消息做摘要"""
    conversation_text = "\n".join(
        f"{'用户' if m['role'] == 'user' else '助手'}: {m['content'][:200]}"
        for m in messages
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",  # 用便宜模型做摘要
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"用 2-3 句话总结以下对话的关键信息：\n{conversation_text}"
        }],
    )
    return response.content[0].text
```

### 1.2 优化 Prompt 长度

```python
# 不好：冗长的 Prompt
BAD_PROMPT = """
你是一个非常优秀的高级软件工程师，你拥有多年的开发经验，精通多种编程语言。
当用户向你提问关于代码的问题时，请按照以下步骤来回答：
第一步：仔细阅读用户提供的代码
第二步：分析代码的主要功能
第三步：检查代码是否有 bug 或潜在问题
第四步：给出改进建议
第五步：提供优化后的代码
请注意你的回答要简洁明了，使用中文回答。
"""

# 好：精炼的 Prompt
GOOD_PROMPT = """
审查以下代码：分析功能、检查 bug、给改进建议和优化代码。用中文简答。
"""
```

Token 节省：~200 tokens → ~30 tokens，每次调用省 ~$0.0005（Sonnet），每天 1000 次省 $0.5。

### 1.3 按任务选择模型

```python
def smart_model_select(task_type, input_length):
    """根据任务类型和输入长度选择模型"""
    # 简单任务用 Haiku
    if task_type in ["summarize", "translate", "format"]:
        return "claude-haiku-4-5-20251001"

    # 中等复杂度 + 短输入用 Sonnet
    if task_type in ["qa", "explain", "refactor"] and input_length < 5000:
        return "claude-sonnet-4-6"

    # 复杂任务或长输入用 Opus
    return "claude-opus-4-7"
```

---

## 二、Cache：缓存策略

### 2.1 为什么需要缓存

很多用户问的问题是重复的：

- "这段代码是什么意思"——同一段代码被多人问
- "帮我写一个快速排序"——经典问题
- "翻译成英文"——同样的文本被重复翻译

每次都调用 LLM，浪费钱也浪费时间。

### 2.2 精确缓存

对相同的输入直接返回缓存结果：

```python
import hashlib
import json
import time


class ExactCache:
    def __init__(self, ttl=3600):
        self.cache = {}
        self.ttl = ttl

    def _make_key(self, messages, model):
        content = json.dumps(messages, ensure_ascii=False)
        return hashlib.md5(f"{model}:{content}".encode()).hexdigest()

    def get(self, messages, model):
        key = self._make_key(messages, model)
        if key in self.cache:
            entry = self.cache[key]
            if time.time() - entry["timestamp"] < self.ttl:
                return entry["response"]
            else:
                del self.cache[key]
        return None

    def set(self, messages, model, response):
        key = self._make_key(messages, model)
        self.cache[key] = {
            "response": response,
            "timestamp": time.time(),
        }


cache = ExactCache(ttl=3600)  # 1 小时过期


async def cached_llm_call(messages, model="claude-sonnet-4-6"):
    # 查缓存
    cached = cache.get(messages, model)
    if cached:
        return cached

    # 调用 LLM
    response = await call_llm(messages, model=model)

    # 写缓存
    cache.set(messages, model, response)
    return response
```

### 2.3 语义缓存

精确缓存只能匹配完全相同的输入。语义缓存能匹配"意思相近"的输入：

```
"什么是快速排序？"     → 命中缓存
"快速排序是什么？"     → 命中缓存（意思一样）
"解释一下快速排序算法" → 命中缓存（意思一样）
```

```python
import numpy as np


class SemanticCache:
    def __init__(self, embedding_fn, similarity_threshold=0.92, ttl=3600):
        self.embedding_fn = embedding_fn
        self.threshold = similarity_threshold
        self.ttl = ttl
        self.entries = []  # [{"embedding": [...], "response": ..., "timestamp": ...}]

    async def get(self, query):
        """查找语义相似的缓存"""
        query_embedding = await self.embedding_fn(query)
        now = time.time()

        best_score = 0
        best_entry = None

        for entry in self.entries:
            # 过期检查
            if now - entry["timestamp"] > self.ttl:
                continue

            # 余弦相似度
            score = cosine_similarity(query_embedding, entry["embedding"])
            if score > best_score:
                best_score = score
                best_entry = entry

        if best_score >= self.threshold and best_entry:
            return best_entry["response"]

        return None

    async def set(self, query, response):
        embedding = await self.embedding_fn(query)
        self.entries.append({
            "embedding": embedding,
            "response": response,
            "timestamp": time.time(),
        })

        # 清理过期条目
        now = time.time()
        self.entries = [e for e in self.entries if now - e["timestamp"] < self.ttl]


def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
```

### 2.4 Anthropic Prompt Caching

Anthropic API 本身支持 Prompt Caching，对重复使用的 system prompt 和长上下文可以缓存：

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": long_system_prompt,  # 长系统提示词
            "cache_control": {"type": "ephemeral"}  # 标记为可缓存
        }
    ],
    messages=messages,
)
```

缓存命中时输入价格降低 90%。

---

## 三、Cost Tracking：费用追踪

### 3.1 实时费用记录

```python
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class CostRecord:
    timestamp: datetime
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    request_id: str
    task_type: str = ""


class CostTracker:
    # 模型定价（$/1M tokens）
    PRICING = {
        "claude-opus-4-7": {"input": 15, "output": 75},
        "claude-sonnet-4-6": {"input": 3, "output": 15},
        "claude-haiku-4-5-20251001": {"input": 0.25, "output": 1.25},
    }

    def __init__(self):
        self.records: list[CostRecord] = []

    def record(self, model, input_tokens, output_tokens, request_id="", task_type=""):
        pricing = self.PRICING.get(model, {"input": 3, "output": 15})
        cost = (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

        self.records.append(CostRecord(
            timestamp=datetime.utcnow(),
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            request_id=request_id,
            task_type=task_type,
        ))

        return cost

    def get_daily_summary(self, date=None):
        """获取某天的费用摘要"""
        if date is None:
            date = datetime.utcnow().date()

        day_records = [r for r in self.records if r.timestamp.date() == date]

        total_cost = sum(r.cost_usd for r in day_records)
        total_input = sum(r.input_tokens for r in day_records)
        total_output = sum(r.output_tokens for r in day_records)

        by_model = {}
        for r in day_records:
            if r.model not in by_model:
                by_model[r.model] = {"cost": 0, "calls": 0, "tokens": 0}
            by_model[r.model]["cost"] += r.cost_usd
            by_model[r.model]["calls"] += 1
            by_model[r.model]["tokens"] += r.input_tokens + r.output_tokens

        return {
            "date": date.isoformat(),
            "total_cost_usd": round(total_cost, 4),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_calls": len(day_records),
            "by_model": {k: {kk: round(vv, 4) for kk, vv in v.items()} for k, v in by_model.items()},
        }

    def check_budget(self, daily_budget=50.0):
        """检查是否超出日预算"""
        summary = self.get_daily_summary()
        if summary["total_cost_usd"] >= daily_budget:
            return {"over_budget": True, "spent": summary["total_cost_usd"], "budget": daily_budget}
        return {"over_budget": False, "spent": summary["total_cost_usd"], "budget": daily_budget}


cost_tracker = CostTracker()
```

### 3.2 集成到 LLM 调用

```python
async def tracked_llm_call(messages, request_id="", task_type="", **kwargs):
    model = kwargs.get("model", "claude-sonnet-4-6")

    # 预算检查
    budget_check = cost_tracker.check_budget(daily_budget=50.0)
    if budget_check["over_budget"]:
        # 超预算后降级到 Haiku
        model = "claude-haiku-4-5-20251001"
        log.warning("cost.budget_exceeded", **budget_check)

    response = await call_llm(messages, model=model, **kwargs)

    # 记录费用
    cost = cost_tracker.record(
        model=model,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        request_id=request_id,
        task_type=task_type,
    )

    log.info("cost.recorded", model=model, cost_usd=round(cost, 6), request_id=request_id)

    return response
```

### 3.3 费用报告

```python
def print_daily_report():
    summary = cost_tracker.get_daily_summary()
    print(f"=== 费用报告 {summary['date']} ===")
    print(f"总费用: ${summary['total_cost_usd']}")
    print(f"总调用: {summary['total_calls']} 次")
    print(f"输入 Token: {summary['total_input_tokens']:,}")
    print(f"输出 Token: {summary['total_output_tokens']:,}")
    print()
    for model, stats in summary["by_model"].items():
        print(f"  {model}: ${stats['cost']} ({stats['calls']} 次, {stats['tokens']:,} tokens)")
```

---

## 四、组合优化策略

```
请求进来
  → 语义缓存检查（命中则直接返回）
    → 预算检查（超预算降级到 Haiku）
      → 模型选择（按任务复杂度选模型）
        → Prompt 压缩（减少不必要的 Token）
          → LLM 调用（带 Prompt Caching）
            → 费用记录
              → 返回结果
```

---

## 五、最佳实践

### 5.1 优化优先级

| 优先级 | 策略 | 节省效果 |
|--------|------|----------|
| 1 | 选对模型 | 10-60x |
| 2 | 精确缓存 | 100%（命中时） |
| 3 | 上下文压缩 | 30-70% |
| 4 | Prompt 精炼 | 10-30% |
| 5 | 语义缓存 | 100%（命中时） |
| 6 | Prompt Caching | 90%（缓存命中时） |

### 5.2 监控指标

```
- 日均费用趋势
- 每模型调用次数和费用占比
- 缓存命中率
- 平均每次调用费用
- Token/请求 比率
```

---

## 小结

| 策略 | 作用 | 实现复杂度 |
|------|------|------------|
| 模型选择 | 按任务选合适模型 | 低 |
| 上下文压缩 | 减少输入 Token | 中 |
| Prompt 精炼 | 缩短系统提示词 | 低 |
| 精确缓存 | 重复请求零成本 | 低 |
| 语义缓存 | 相似问题零成本 | 高 |
| Prompt Caching | 长上下文缓存 | 低 |
| 费用追踪 | 监控成本趋势 | 中 |
| 预算控制 | 超支自动降级 | 中 |

不需要全部用上。从"选对模型 + 精确缓存 + 费用追踪"开始，就能覆盖 80% 的优化需求。
