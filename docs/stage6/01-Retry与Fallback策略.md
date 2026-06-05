# Retry 与 Fallback 策略

## 为什么需要 Retry 和 Fallback

调用 LLM API 时会遇到各种失败：

- **网络超时**：请求发出去了，服务器没响应
- **速率限制（429）**：短时间内调用太多，被限流
- **服务端错误（500/502/503）**：模型服务暂时不可用
- **Token 超限（400）**：输入太长超过 Context Window
- **内容过滤**：输入或输出触发了安全策略

如果是用户正在等回复的聊天应用，一次失败就意味着"白屏"。生产环境必须处理这些情况。

---

## 一、Retry：自动重试

### 1.1 基本思路

失败后等一会儿再试。关键问题是：

- **等多久**：不能立刻重试（服务器可能还在过载）
- **试几次**：不能无限重试（用户等不了）
- **哪些错误值得重试**：不是所有错误都值得重试

### 1.2 指数退避（Exponential Backoff）

最常用的重试策略：每次重试等待时间翻倍。

```
第 1 次失败 → 等待 1s → 重试
第 2 次失败 → 等待 2s → 重试
第 3 次失败 → 等待 4s → 重试
第 4 次失败 → 等待 8s → 重试
...达到最大重试次数，放弃
```

Python 实现：

```python
import asyncio
import time
from anthropic import Anthropic

client = Anthropic()

async def call_llm_with_retry(messages, max_retries=3, base_delay=1.0):
    for attempt in range(max_retries + 1):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                messages=messages
            )
            return response
        except Exception as e:
            if attempt == max_retries:
                raise  # 最后一次也失败了，抛出异常

            # 判断是否值得重试
            if not is_retryable(e):
                raise

            delay = base_delay * (2 ** attempt)  # 1s, 2s, 4s
            print(f"第 {attempt + 1} 次失败: {e}，{delay}s 后重试...")
            await asyncio.sleep(delay)


def is_retryable(error):
    """判断错误是否值得重试"""
    error_str = str(error).lower()

    # 可重试：速率限制、服务端错误、超时
    retryable_keywords = ["429", "500", "502", "503", "timeout", "overloaded"]
    if any(kw in error_str for kw in retryable_keywords):
        return True

    # 不可重试：参数错误、内容过滤、认证失败
    non_retryable = ["400", "401", "403", "content_filter"]
    if any(kw in error_str for kw in non_retryable):
        return False

    # 默认可重试
    return True
```

### 1.3 Node.js 实现

```javascript
async function callLLMWithRetry(messages, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages,
      });
      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;

      if (!isRetryable(error)) throw error;

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`第 ${attempt + 1} 次失败: ${error.message}，${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function isRetryable(error) {
  const status = error.status || error.statusCode || 0;
  // 429 限流、5xx 服务端错误可重试
  return status === 429 || (status >= 500 && status < 600);
}
```

### 1.4 Jitter：避免重试风暴

如果很多客户端在同一时刻失败，它们会在同一时刻重试，造成"重试风暴"。解决方案是给延迟加上随机抖动：

```python
import random

delay = base_delay * (2 ** attempt) + random.uniform(0, base_delay)
# 例如第 2 次：2s + 随机(0~1s) = 2~3s
```

---

## 二、Fallback：模型降级

### 2.1 基本思路

主模型不可用时，自动切换到备选模型：

```
Claude Opus → 失败 → Claude Sonnet → 失败 → Claude Haiku
```

### 2.2 Python 实现

```python
FALLBACK_MODELS = [
    {"model": "claude-opus-4-7", "max_tokens": 4096},
    {"model": "claude-sonnet-4-6", "max_tokens": 2048},
    {"model": "claude-haiku-4-5-20251001", "max_tokens": 1024},
]


async def call_with_fallback(messages, max_retries_per_model=2):
    last_error = None

    for model_config in FALLBACK_MODELS:
        try:
            return await call_llm_with_retry(
                messages,
                max_retries=max_retries_per_model
            )
        except Exception as e:
            print(f"模型 {model_config['model']} 失败: {e}")
            last_error = e
            continue  # 尝试下一个模型

    raise last_error  # 所有模型都失败了
```

### 2.3 智能降级策略

不是所有场景都应该用最强模型。可以根据任务复杂度选择：

```python
def select_model(task_complexity):
    """根据任务复杂度选择模型"""
    if task_complexity == "simple":
        # 简单问答、翻译、总结
        return "claude-haiku-4-5-20251001"
    elif task_complexity == "medium":
        # 代码生成、分析
        return "claude-sonnet-4-6"
    else:
        # 复杂推理、长文档
        return "claude-opus-4-7"


def estimate_complexity(messages):
    """粗略估算任务复杂度"""
    total_chars = sum(len(m.get("content", "")) for m in messages)

    if total_chars < 500:
        return "simple"
    elif total_chars < 3000:
        return "medium"
    else:
        return "complex"
```

---

## 三、Circuit Breaker：熔断器

### 3.1 为什么需要熔断

如果上游服务持续不可用，持续重试只会：
- 浪费资源
- 增加延迟
- 让情况更糟

熔断器的思路：连续失败达到阈值后，暂时停止请求，过一段时间再试探。

### 3.2 三种状态

```
         连续失败 >= N 次              过了冷却时间
CLOSED ──────────────────→ OPEN ──────────────────→ HALF-OPEN
  ↑                                                     │
  │           试探成功                                   │
  └─────────────────────────────────────────────────────┘
                          试探失败
                   HALF-OPEN ────→ OPEN
```

- **CLOSED（关闭）**：正常请求
- **OPEN（打开）**：直接拒绝请求，不调用 API
- **HALF-OPEN（半开）**：试探性地发一个请求，看服务是否恢复

### 3.3 Python 实现

```python
import time
from enum import Enum


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(self, failure_threshold=5, recovery_timeout=30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0

    def can_execute(self):
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                return True
            return False

        # HALF_OPEN：允许一个请求通过
        return True

    def record_success(self):
        self.failure_count = 0
        self.state = CircuitState.CLOSED

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN


# 使用示例
circuit = CircuitBreaker(failure_threshold=3, recovery_timeout=60)

async def call_with_circuit_breaker(messages):
    if not circuit.can_execute():
        raise Exception("熔断器已打开，请求被拒绝")

    try:
        result = await call_llm_with_retry(messages)
        circuit.record_success()
        return result
    except Exception as e:
        circuit.record_failure()
        raise
```

---

## 四、组合策略：Retry + Fallback + Circuit Breaker

生产环境通常三层保护叠加使用：

```python
async def resilient_call(messages):
    """生产级 LLM 调用：熔断 → 降级 → 重试"""

    # 1. 熔断检查
    if not circuit.can_execute():
        # 熔断状态下直接用最便宜的模型兜底
        return await direct_call("claude-haiku-4-5-20251001", messages)

    # 2. Fallback 降级
    for model_config in FALLBACK_MODELS:
        try:
            # 3. Retry 重试
            result = await call_llm_with_retry(
                messages,
                model=model_config["model"],
                max_retries=2
            )
            circuit.record_success()
            return result
        except Exception as e:
            print(f"模型 {model_config['model']} 全部重试失败: {e}")
            continue

    circuit.record_failure()
    raise Exception("所有模型均不可用")
```

调用链路：

```
用户请求
  → 熔断器检查（是否放行）
    → 模型 A + 指数退避重试
      → 失败 → 模型 B + 重试
        → 失败 → 模型 C + 重试
          → 全部失败 → 记录熔断
```

---

## 五、重试与降级的最佳实践

### 5.1 哪些错误重试，哪些不重试

| 错误类型 | HTTP 状态码 | 是否重试 | 原因 |
|----------|-------------|----------|------|
| 速率限制 | 429 | 是 | 等一会儿就能恢复 |
| 服务端错误 | 500/502/503 | 是 | 临时故障 |
| 超时 | - | 是 | 网络波动 |
| 参数错误 | 400 | 否 | 请求本身有问题 |
| 认证失败 | 401/403 | 否 | Key 无效或权限不足 |
| 内容过滤 | 自定义 | 否 | 输入内容违规 |
| Token 超限 | 400 | 否 | 需要减少输入 |

### 5.2 配置建议

```python
# 生产环境推荐配置
PRODUCTION_CONFIG = {
    "max_retries": 3,          # 每个模型最多重试 3 次
    "base_delay": 1.0,         # 初始等待 1 秒
    "max_delay": 30.0,         # 最长等待 30 秒
    "fallback_models": [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    ],
    "circuit_threshold": 5,    # 连续 5 次失败熔断
    "circuit_recovery": 60,    # 60 秒后尝试恢复
}
```

### 5.3 给用户的反馈

重试时不要让用户干等：

```javascript
// SSE 流式返回重试状态
res.write(`data: ${JSON.stringify({
  type: 'status',
  message: `主模型暂时不可用，正在切换备选模型...`
})}\n\n`);
```

---

## 小结

| 概念 | 作用 | 关键参数 |
|------|------|----------|
| Retry | 自动重试临时故障 | max_retries, base_delay |
| Exponential Backoff | 避免频繁重试加重负载 | 2^n 增长 |
| Jitter | 防止重试风暴 | 随机偏移 |
| Fallback | 模型降级兜底 | 模型优先级列表 |
| Circuit Breaker | 连续失败时停止请求 | failure_threshold, recovery_timeout |

这三者组合起来，就是 LLM 应用在生产环境的"安全网"。
