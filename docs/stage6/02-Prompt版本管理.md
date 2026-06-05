# Prompt 版本管理

## 为什么需要管理 Prompt

在前五个阶段，Prompt 大多直接写在代码里：

```python
prompt = f"你是一个AI助手，请解释以下代码：\n{code}"
```

这种方式有几个问题：

1. **改了不知道**：改了 Prompt 但忘了为什么改
2. **改不回去**：改坏了不知道之前的效果
3. **没法对比**：不知道新版本比旧版本好还是差
4. **多人冲突**：多个人同时改同一个 Prompt
5. **线上线下不一致**：本地改了但部署的还在用旧版本

Prompt 是 AI 应用的核心逻辑，应该像代码一样被版本管理。

---

## 一、Prompt 版本管理的层次

```
Level 1：代码中的字符串 → 改了就行
Level 2：独立文件管理 → prompt.md
Level 3：版本控制 + 变量模板 → git + template
Level 4：数据库存储 + API 管理 → 配置中心
Level 5：A/B 测试 + 自动优化 → 实验平台
```

本阶段要求掌握 Level 2 ~ Level 4。

---

## 二、Level 2：文件管理

### 2.1 目录结构

把所有 Prompt 模板从代码中抽离到独立文件：

```
prompts/
├── chat/
│   ├── system.md          # 聊天系统提示词
│   └── summarize.md       # 摘要提示词
├── code/
│   ├── explain.md         # 代码解释
│   ├── refactor.md        # 代码重构
│   └── generate.md        # 代码生成
└── rag/
    └── qa.md              # RAG 问答
```

### 2.2 模板文件示例

`prompts/code/explain.md`：

```markdown
# 代码解释

你是一名资深{{language}}开发者，请解释以下代码的功能。

要求：
1. 用简洁的中文描述代码的主要功能
2. 解释关键逻辑和设计思路
3. 如果有潜在问题，指出并给出建议

## 代码

```{{language}}
{{code}}
```
```

### 2.3 加载器

```python
import os
from string import Template


class PromptLoader:
    def __init__(self, prompts_dir="prompts"):
        self.prompts_dir = prompts_dir

    def load(self, path, **kwargs):
        """加载 Prompt 模板并填充变量"""
        file_path = os.path.join(self.prompts_dir, path)

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Prompt 文件不存在: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 使用安全模板替换，避免 KeyError
        template = Template(content.replace("{{", "${").replace("}}", "}"))
        return template.safe_substitute(**kwargs)


# 使用
loader = PromptLoader()
prompt = loader.load("code/explain.md", language="python", code="def foo(): pass")
```

Node.js 版本：

```javascript
import fs from 'fs';
import path from 'path';

class PromptLoader {
  constructor(promptsDir = 'prompts') {
    this.promptsDir = promptsDir;
  }

  load(templatePath, variables = {}) {
    const filePath = path.join(this.promptsDir, templatePath);
    let content = fs.readFileSync(filePath, 'utf-8');

    // 替换 {{variable}} 占位符
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return content;
  }
}
```

---

## 三、Level 3：Git 版本控制

### 3.1 利用 Git 管理变更

Prompt 文件放到项目仓库中，天然获得 Git 的版本控制能力：

```bash
# 查看 Prompt 的修改历史
git log --oneline prompts/code/explain.md

# 查看某次改了什么
git diff HEAD~1 prompts/code/explain.md

# 回滚到之前的版本
git checkout HEAD~1 -- prompts/code/explain.md
```

### 3.2 Prompt 变更规范

给 Prompt 变更建立 commit 规范：

```
prompt(code/explain): 添加性能分析要求

之前只解释功能，现在增加对性能的评估
测试结果：准确率从 85% 提升到 92%
```

### 3.3 版本元数据

在模板文件顶部用 YAML frontmatter 记录元数据：

```markdown
---
version: "2.1.0"
author: luke
updated: "2026-06-04"
description: "代码解释 Prompt，支持多语言"
tags: ["code", "explain"]
changelog:
  - version: "2.1.0"
    date: "2026-06-04"
    change: "增加性能分析要求"
  - version: "2.0.0"
    date: "2026-05-20"
    change: "重构为多语言模板"
  - version: "1.0.0"
    date: "2026-05-01"
    change: "初始版本"
---

你是一名资深{{language}}开发者，请解释以下代码的功能。
...
```

```python
import yaml

class VersionedPromptLoader(PromptLoader):
    def load_with_meta(self, path, **kwargs):
        file_path = os.path.join(self.prompts_dir, path)
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 解析 frontmatter
        if content.startswith("---"):
            parts = content.split("---", 2)
            metadata = yaml.safe_load(parts[1])
            body = parts[2].strip()
        else:
            metadata = {}
            body = content

        template = Template(body.replace("{{", "${").replace("}}", "}"))
        rendered = template.safe_substitute(**kwargs)

        return {
            "content": rendered,
            "version": metadata.get("version", "unknown"),
            "metadata": metadata,
        }
```

---

## 四、Level 4：数据库管理

### 4.1 适用场景

当系统需要以下能力时，需要把 Prompt 存到数据库：

- **运行时修改**：不重新部署就能更新 Prompt
- **按用户/场景切换**：不同用户使用不同的 Prompt
- **A/B 测试**：同时运行多个版本对比效果
- **审计日志**：记录每次 Prompt 变更

### 4.2 数据模型

```sql
CREATE TABLE prompt_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,         -- 如 "code/explain"
    version VARCHAR(50) NOT NULL,       -- 如 "2.1.0"
    content TEXT NOT NULL,              -- Prompt 内容
    variables JSONB DEFAULT '[]',       -- 模板变量列表
    is_active BOOLEAN DEFAULT FALSE,    -- 是否为当前活跃版本
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(100),
    UNIQUE(name, version)
);

CREATE INDEX idx_prompt_active ON prompt_templates(name, is_active);
```

### 4.3 Python CRUD

```python
import asyncpg


class PromptManager:
    def __init__(self, db_url):
        self.db_url = db_url
        self.pool = None

    async def init(self):
        self.pool = await asyncpg.create_pool(self.db_url)

    async def get_active(self, name):
        """获取指定 Prompt 的活跃版本"""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM prompt_templates WHERE name = $1 AND is_active = TRUE",
                name,
            )
            if not row:
                raise ValueError(f"Prompt '{name}' 没有活跃版本")
            return dict(row)

    async def create_version(self, name, version, content, variables=None, author="system"):
        """创建新版本"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO prompt_templates (name, version, content, variables, created_by)
                   VALUES ($1, $2, $3, $4, $5)""",
                name, version, content,
                variables or [], author,
            )

    async def activate(self, name, version):
        """激活指定版本"""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 先取消所有活跃版本
                await conn.execute(
                    "UPDATE prompt_templates SET is_active = FALSE WHERE name = $1",
                    name,
                )
                # 激活目标版本
                result = await conn.execute(
                    "UPDATE prompt_templates SET is_active = TRUE WHERE name = $1 AND version = $2",
                    name, version,
                )
                if result == "UPDATE 0":
                    raise ValueError(f"版本 {name}@{version} 不存在")

    async def render(self, name, **kwargs):
        """获取活跃版本并渲染变量"""
        prompt = await self.get_active(name)
        content = prompt["content"]
        for key, value in kwargs.items():
            content = content.replace(f"{{{{{key}}}}}", str(value))
        return content

    async def list_versions(self, name):
        """列出所有版本"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT version, is_active, created_at, created_by FROM prompt_templates WHERE name = $1 ORDER BY created_at DESC",
                name,
            )
            return [dict(r) for r in rows]
```

### 4.4 使用示例

```python
# 初始化
manager = PromptManager("postgresql://localhost/mydb")
await manager.init()

# 创建版本
await manager.create_version(
    "code/explain", "1.0.0",
    "请解释以下{{language}}代码：\n{{code}}",
    variables=["language", "code"],
    author="luke",
)

# 激活
await manager.activate("code/explain", "1.0.0")

# 运行时使用
prompt = await manager.render("code/explain", language="Python", code="def foo(): pass")
```

---

## 五、A/B 测试（进阶）

### 5.1 基本思路

同时运行两个版本的 Prompt，对比效果：

```
用户 A → Prompt v1 → 评分 4.2
用户 B → Prompt v2 → 评分 4.5
```

### 5.2 实现

```python
import hashlib


class ABTestPrompt:
    def __init__(self, prompt_manager):
        self.pm = prompt_manager

    async def get_prompt(self, name, user_id, **kwargs):
        """根据用户 ID 哈希分配版本"""
        # 获取所有版本
        versions = await self.pm.list_versions(name)

        if len(versions) < 2:
            return await self.pm.render(name, **kwargs)

        # 用用户 ID 做确定性分桶
        bucket = int(hashlib.md5(user_id.encode()).hexdigest(), 16) % 100

        # 50/50 分流
        if bucket < 50:
            version = versions[0]["version"]
        else:
            version = versions[1]["version"]

        # 临时激活指定版本渲染
        template = await self.pm.get_active(name)  # 简化：实际应该按 version 查询
        content = template["content"]
        for key, value in kwargs.items():
            content = content.replace(f"{{{{{key}}}}}", str(value))

        return {
            "content": content,
            "version": version,
            "bucket": "A" if bucket < 50 else "B",
        }
```

---

## 六、最佳实践

### 6.1 Prompt 变更流程

```
1. 在本地修改 Prompt 文件
2. 用测试用例验证效果
3. Commit 并推送到 Git
4. 创建数据库新版本
5. 在小流量上 A/B 测试
6. 确认效果后激活新版本
7. 标记旧版本为 archived
```

### 6.2 命名规范

```
{场景}/{功能}.md

例如：
- chat/system.md          # 聊天系统提示
- code/explain.md         # 代码解释
- code/refactor.md        # 代码重构
- rag/qa.md               # RAG 问答
- tool/routing.md         # 工具路由
```

### 6.3 变量占位符

统一使用 `{{variable}}` 格式，与 LLM 的 `{}` 和 f-string 的 `{}` 不冲突。

---

## 小结

| 层次 | 方案 | 适用场景 |
|------|------|----------|
| Level 1 | 代码硬编码 | 快速原型 |
| Level 2 | 文件管理 | 小项目 |
| Level 3 | Git + 模板 | 中型项目 |
| Level 4 | 数据库存储 | 需要运行时切换 |
| Level 5 | A/B 测试平台 | 大规模产品 |

从 Level 2 开始，每升一级解决一个具体问题。不需要一步到位，根据项目规模选择合适的层次。
