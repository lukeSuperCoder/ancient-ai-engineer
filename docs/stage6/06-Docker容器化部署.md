# Docker 容器化部署

## 为什么需要 Docker

在前面阶段，运行项目的方式是：

```bash
# 安装依赖
pip install -r requirements.txt
npm install

# 配置环境变量
cp .env.example .env

# 启动服务
python app.py
npm run dev
```

但换一台机器就要重新配置。Docker 解决的核心问题是：

> **"在我机器上能跑" → "在任何机器上都能跑"**

---

## 一、Docker 基础概念

### 1.1 三个核心概念

```
Dockerfile  → 镜像（Image） → 容器（Container）
  构建配方      打包好的系统       运行中的实例
```

- **Dockerfile**：描述如何构建镜像的脚本
- **Image（镜像）**：包含代码、依赖、运行时的只读包
- **Container（容器）**：镜像的运行实例

### 1.2 与虚拟机的区别

```
虚拟机：
  应用 → Guest OS → Hypervisor → Host OS → 硬件
  （每个 VM 都有完整 OS，GB 级别，分钟级启动）

容器：
  应用 → Docker Engine → Host OS → 硬件
  （共享宿主 OS，MB 级别，秒级启动）
```

---

## 二、Python 项目 Docker 化

### 2.1 项目结构

```
my-ai-app/
├── app.py
├── requirements.txt
├── Dockerfile
└── .dockerignore
```

### 2.2 Dockerfile

```dockerfile
# 基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 先复制依赖文件（利用缓存层）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 再复制源代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2.3 .dockerignore

```
__pycache__/
*.pyc
.env
.git
.venv
node_modules
*.md
```

**重要**：`.env` 文件不应该打包进镜像！环境变量在运行时注入。

### 2.4 构建和运行

```bash
# 构建镜像
docker build -t my-ai-app:latest .

# 运行容器
docker run -d \
  --name my-ai-app \
  -p 8000:8000 \
  -e ANTHROPIC_API_KEY=sk-xxx \
  -e MODEL_ID=claude-sonnet-4-6 \
  my-ai-app:latest

# 查看日志
docker logs -f my-ai-app

# 停止
docker stop my-ai-app

# 删除
docker rm my-ai-app
```

---

## 三、Node.js 项目 Docker 化

### 3.1 Dockerfile

```dockerfile
# 构建阶段
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行阶段（更小的镜像）
FROM node:20-slim AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

多阶段构建的好处：最终镜像不包含源代码和 devDependencies，体积更小。

### 3.2 Mini ChatGPT 的 Dockerfile

```dockerfile
# 后端
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

EXPOSE 8787
CMD ["node", "server/index.js"]
```

```dockerfile
# 前端（Nginx 托管静态文件）
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## 四、Docker Compose：多服务编排

### 4.1 为什么需要 Compose

AI 应用通常不只一个服务：

```
前端（Vue/React）
  → 后端 API（Node/Python）
    → PostgreSQL（数据库）
      → Redis（缓存/队列）
```

手动启动和管理多个容器很麻烦。Docker Compose 用一个 YAML 文件定义所有服务。

### 4.2 AI 应用 Compose 示例

```yaml
# docker-compose.yml
version: "3.8"

services:
  # 后端 API
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "8787:8787"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - MODEL_ID=${MODEL_ID:-claude-sonnet-4-6}
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/ai_app
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  # 前端
  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "5173:80"
    depends_on:
      - api
    restart: unless-stopped

  # PostgreSQL
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: ai_app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

### 4.3 常用命令

```bash
# 启动所有服务（后台运行）
docker compose up -d

# 查看运行状态
docker compose ps

# 查看日志
docker compose logs -f api

# 重启某个服务
docker compose restart api

# 停止所有服务
docker compose down

# 停止并删除数据卷（清空数据库）
docker compose down -v

# 重新构建并启动
docker compose up -d --build
```

---

## 五、Redis Queue：异步任务队列

### 5.1 为什么需要异步队列

有些 AI 操作很慢（几十秒甚至几分钟）：

- 长文档 RAG 问答
- 批量 Embedding 生成
- 多 Agent 协作任务
- 大规模文本翻译

如果同步处理，用户会等到超时。解决方案：

```
用户请求 → 放入队列 → 立即返回任务 ID
                         ↓
                     Worker 后台处理
                         ↓
                     用户轮询/WebSocket 获取结果
```

### 5.2 Python 实现（Redis + BullMQ 风格）

```python
import redis
import json
import uuid
import time


class TaskQueue:
    def __init__(self, redis_url="redis://localhost:6379"):
        self.redis = redis.from_url(redis_url)

    def enqueue(self, queue_name, task_data):
        """提交任务"""
        task_id = str(uuid.uuid4())
        task = {
            "id": task_id,
            "data": task_data,
            "status": "pending",
            "created_at": time.time(),
        }

        # 存储任务信息
        self.redis.hset(f"task:{task_id}", mapping={
            "status": "pending",
            "data": json.dumps(task_data, ensure_ascii=False),
            "created_at": str(task["created_at"]),
        })

        # 放入队列
        self.redis.lpush(f"queue:{queue_name}", task_id)

        return task_id

    def dequeue(self, queue_name, timeout=0):
        """获取任务（阻塞等待）"""
        result = self.redis.brpop(f"queue:{queue_name}", timeout=timeout)
        if result:
            task_id = result[1].decode()
            task_data = self.redis.hget(f"task:{task_id}", "data")
            return {
                "id": task_id,
                "data": json.loads(task_data),
            }
        return None

    def update_status(self, task_id, status, result=None):
        """更新任务状态"""
        self.redis.hset(f"task:{task_id}", "status", status)
        if result:
            self.redis.hset(f"task:{task_id}", "result",
                           json.dumps(result, ensure_ascii=False))

    def get_task(self, task_id):
        """查询任务状态"""
        data = self.redis.hgetall(f"task:{task_id}")
        if not data:
            return None
        return {
            "id": task_id,
            "status": data.get(b"status", b"").decode(),
            "result": json.loads(data[b"result"]) if b"result" in data else None,
        }


queue = TaskQueue()
```

### 5.3 Worker 消费者

```python
import asyncio
import signal
import sys


class AIWorker:
    def __init__(self, queue, llm_client):
        self.queue = queue
        self.client = llm_client
        self.running = True

    def stop(self, signum, frame):
        print("Worker 正在停止...")
        self.running = False

    async def process_task(self, task):
        """处理单个任务"""
        task_id = task["id"]
        data = task["data"]

        try:
            self.queue.update_status(task_id, "processing")

            # 调用 LLM
            response = await self.client.messages.create(
                model=data.get("model", "claude-sonnet-4-6"),
                max_tokens=data.get("max_tokens", 2048),
                messages=data["messages"],
            )

            result = {
                "content": response.content[0].text,
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            }

            self.queue.update_status(task_id, "completed", result)
            print(f"任务 {task_id} 完成")

        except Exception as e:
            self.queue.update_status(task_id, "failed", {"error": str(e)})
            print(f"任务 {task_id} 失败: {e}")

    async def run(self, queue_name="ai_tasks"):
        """启动 Worker 循环"""
        print(f"Worker 启动，监听队列: {queue_name}")

        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)

        while self.running:
            task = self.queue.dequeue(queue_name, timeout=5)
            if task:
                await self.process_task(task)

        print("Worker 已停止")


# 启动 Worker
# worker = AIWorker(queue, anthropic_client)
# asyncio.run(worker.run())
```

### 5.4 API 端（Express 示例）

```javascript
// 提交任务
app.post('/api/ask', async (req, res) => {
  const { messages, model } = req.body;
  const taskId = await queue.enqueue('ai_tasks', { messages, model });
  res.json({ taskId, status: 'pending' });
});

// 查询任务状态
app.get('/api/task/:taskId', async (req, res) => {
  const task = await queue.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json(task);
});
```

---

## 六、镜像优化

### 6.1 减小镜像体积

```dockerfile
# 不好：使用完整镜像（~1GB）
FROM python:3.11
FROM node:20

# 好：使用 slim/alpine 镜像（~150MB）
FROM python:3.11-slim
FROM node:20-slim
FROM python:3.11-alpine   # 更小但可能有兼容问题
```

### 6.2 利用构建缓存

```dockerfile
# 好：先复制依赖文件，依赖不变时跳过安装
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .

# 不好：每次代码改动都重新安装依赖
COPY . .
RUN pip install -r requirements.txt
```

### 6.3 安全最佳实践

```dockerfile
# 使用非 root 用户
RUN useradd -m appuser
USER appuser

# 不在镜像中包含敏感信息
# .env 文件通过 .dockerignore 排除
# 运行时通过 -e 或 --env-file 注入
```

---

## 七、生产环境部署清单

### 7.1 部署前检查

```
[ ] .env 没有打包进镜像
[ ] 使用非 root 用户运行
[ ] 健康检查配置正确
[ ] 日志输出到 stdout/stderr（不是文件）
[ ] 数据库使用 Volume 持久化
[ ] Redis 使用 Volume 持久化
[ ] 端口只暴露必要的
[ ] 镜像 tag 使用具体版本号（不是 latest）
```

### 7.2 常用 docker-compose.prod.yml

```yaml
# docker-compose.prod.yml - 生产环境覆盖
version: "3.8"

services:
  api:
    image: my-ai-app/api:v1.0.0  # 生产用固定版本
    deploy:
      replicas: 2                 # 2 个实例
      resources:
        limits:
          memory: 1G
          cpus: "0.5"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    environment:
      - NODE_ENV=production

  db:
    volumes:
      - /data/postgres:/var/lib/postgresql/data  # 指定宿主目录
```

```bash
# 生产启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 小结

| 工具 | 作用 |
|------|------|
| Dockerfile | 定义如何构建镜像 |
| docker build | 构建镜像 |
| docker run | 运行容器 |
| Docker Compose | 编排多服务 |
| Redis Queue | 异步任务处理 |
| 多阶段构建 | 减小镜像体积 |

从单个项目的 Dockerfile 开始，逐步加入 Compose 编排和 Redis 异步队列。先把一个服务跑起来，再考虑多服务。
