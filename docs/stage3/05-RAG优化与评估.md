# RAG 优化与评估

## 文档目标

这份文档讲清楚 RAG 从 Demo 走向可用系统时必须掌握的优化方法：

> 如何让 RAG 找得更准、答得更稳、来源更可信。

学完后，你应该能理解：

- Hybrid Search 是什么
- Rerank 是什么
- Metadata Filter 是什么
- Citation 如何设计
- RAG 答错时如何排查
- 如何评估 RAG 系统效果

---

## 1. 为什么需要 RAG 优化

一个最小 RAG 很容易做出来：

```text
Chunk → Embedding → Vector Search → Prompt → Answer
```

但企业使用时会遇到很多问题：

- 检索结果不准
- 关键词、编号、术语搜不到
- 检索结果太多噪声
- 模型引用了错误资料
- 用户看不到来源
- 不同用户权限不一致
- 文档更新后旧内容还被检索

所以第三阶段不能只学“跑通”，还要学“调优”。

---

## 2. Hybrid Search

Hybrid Search 是混合检索。

它通常指：

> 向量检索 + 关键词检索。

向量检索擅长语义相似：

```text
用户问：怎么休年假？
文档写：年假申请流程
```

关键词检索擅长精确匹配：

```text
合同编号：HT-2026-001
产品型号：XG-500
员工编号：E10234
```

企业资料里经常有编号、简称、术语、表格字段，只靠向量检索会漏。

Hybrid Search 的思路是：

```text
用户问题
  ↓
同时做向量检索和关键词检索
  ↓
合并候选结果
  ↓
去重
  ↓
交给 Rerank 或直接取 Top K
```

---

## 3. Rerank

Rerank 是重排序。

第一阶段检索通常是粗排：

```text
先快速找出 20 个可能相关的 Chunk
```

Rerank 再做精排：

```text
从 20 个候选里选出最相关的 5 个
```

为什么需要 Rerank？

- 向量检索只看向量距离
- 关键词检索只看词匹配
- Rerank 可以更细地判断“问题和 Chunk 是否真的匹配”

常见流程：

```text
Vector Search Top 20
  ↓
Rerank Top 5
  ↓
Prompt Assemble
```

Rerank 会增加成本和延迟，但通常能显著提升准确率。

---

## 4. Metadata Filter

Metadata Filter 是按元数据过滤检索范围。

企业知识库里非常重要。

常见过滤条件：

- knowledge_base_id
- department_id
- document_type
- product
- created_at
- access_level
- owner_id

例如：

```text
用户是 HR 部门员工
只允许检索 HR 知识库和公开制度文档
```

检索时应该先过滤：

```text
where knowledge_base_id in user_allowed_kbs
and access_level <= user_access_level
```

再做相似度搜索。

没有 Metadata Filter，RAG 可能把不该看的资料回答给用户。

---

## 5. Citation 来源引用

Citation 是来源引用。

它的目标是：

> 让用户知道答案依据来自哪里。

常见引用粒度：

- 文档名
- 页码
- 章节标题
- Chunk 编号
- 原文片段
- 文件链接

推荐返回结构：

```json
{
  "answer": "年假申请需要在 OA 系统提交。",
  "sources": [
    {
      "source": "员工手册.pdf",
      "page": 12,
      "section": "年假申请流程",
      "quote": "员工年假申请需要在 OA 系统提交。"
    }
  ]
}
```

Citation 的价值：

- 用户可以验证答案
- 产品更可信
- 方便排查错误
- 满足企业合规要求

---

## 6. RAG 如何减少幻觉

RAG 不能完全消灭幻觉，但可以减少幻觉。

原因是：

- 模型回答前先拿到相关资料
- Prompt 明确要求只根据资料回答
- 资料不足时要求说明不知道
- 回答附带来源引用

但如果检索资料错误，模型仍然可能答错。

所以更准确的说法是：

> RAG 通过外部资料约束模型回答，但系统质量取决于检索、Prompt、引用和评估的整体设计。

---

## 7. RAG 答错了怎么排查

不要只怪模型。

按链路排查：

### 7.1 文档是否正确

- 原文是否有答案
- 文档是否过期
- 文档是否解析失败
- 表格是否丢失

### 7.2 Chunk 是否合理

- 是否把关键上下文切断
- Chunk 是否太大
- Chunk 是否太小
- 元数据是否丢失

### 7.3 检索是否命中

- Top K 是否包含正确 Chunk
- 相似度阈值是否太高或太低
- 是否需要关键词检索
- 是否需要 Rerank

### 7.4 Prompt 是否约束清楚

- 是否要求只根据资料回答
- 是否要求资料不足时说明不知道
- 是否把来源编号传给模型

### 7.5 生成是否引用错误

- 模型是否混用了多个来源
- Citation 是否和答案对应
- 是否需要结构化输出约束

---

## 8. 如何评估 RAG

最简单的评估方式是准备一组测试问题。

每个测试样例包含：

```json
{
  "question": "年假怎么申请？",
  "expected_source": "员工手册.pdf#page=12",
  "expected_answer_points": [
    "OA 系统提交",
    "超过 3 天需要审批"
  ]
}
```

评估时看三件事：

1. 检索是否找到了正确来源
2. 回答是否覆盖关键点
3. 引用是否真实对应答案

建议把评估拆成两层：

```text
检索评估：Top K 是否包含正确 Chunk
回答评估：答案是否准确、完整、有引用
```

---

## 9. 常见优化顺序

不要一开始就堆复杂技术。

建议按顺序优化：

1. 清洗文档解析结果
2. 调整 Chunk 大小和 Overlap
3. 增加 Metadata Filter
4. 调整 Top K 和相似度阈值
5. 增加 Citation
6. 增加 Hybrid Search
7. 增加 Rerank
8. 建立测试问题集

这个顺序更适合学习和工程落地。

---

## 10. 常见误区

### 误区一：Rerank 一定要最先做

不一定。

如果文档解析和 Chunk 都很差，Rerank 也救不了。

---

### 误区二：Top K 越大越好

不对。

Top K 太大，会把大量噪声放进 Prompt，反而影响回答。

---

### 误区三：有 Citation 就一定可信

不一定。

Citation 必须和答案内容对应。如果模型回答 A，却引用 B，仍然是错误。

---

## 11. 学完后的检查标准

你应该能回答：

- Hybrid Search 解决什么问题？
- Rerank 为什么通常放在粗检索之后？
- Metadata Filter 在企业知识库里为什么重要？
- Citation 应该包含哪些信息？
- RAG 答错时应该如何按链路排查？
- 如何设计一组 RAG 测试问题？

---

## 12. 推荐实践

建议在最小 RAG 基础上做四个增强：

1. 增加 `knowledge_base_id` 过滤
2. 返回每个答案的来源文档和页码
3. 准备 10 个测试问题，记录正确来源
4. 对比不同 Chunk 大小和 Top K 的效果

完成这些后，再考虑 Hybrid Search 和 Rerank。

