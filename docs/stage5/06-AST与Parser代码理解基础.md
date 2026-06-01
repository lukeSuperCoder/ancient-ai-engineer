# 06 - AST 与 Parser 代码理解基础

## 文档目标

这份文档讲清楚：

> AST / Parser 是什么，以及为什么 AI IDE 需要代码结构理解能力。

学完后，你应该能理解：

- Parser 如何把代码变成 AST
- AST 能帮助 AI IDE 解决什么问题
- Babel Parser、TS Compiler API、Tree-sitter 分别适合什么场景
- 如何用 AST 提取函数、变量、导入和调用关系

---

## 1. 为什么不能只把代码当字符串

最简单的 AI 代码助手会这样做：

```text
读取一段代码字符串
  ↓
发给 LLM
  ↓
让 LLM 解释或修改
```

这能做 Demo，但做复杂功能会遇到问题：

- 不知道函数边界
- 不知道变量作用域
- 不知道 import 从哪里来
- 不知道函数被谁调用
- 不知道当前选区属于哪个类或方法
- 很难做精确重构

所以 AI IDE 需要 Parser。

---

## 2. Parser 和 AST 是什么

Parser 是解析器。

它的作用是：

```text
代码字符串
  ↓
Parser
  ↓
AST（Abstract Syntax Tree，抽象语法树）
```

例如代码：

```ts
function add(a: number, b: number) {
  return a + b;
}
```

会被解析成类似结构：

```text
FunctionDeclaration
  name: add
  params:
    Identifier a
    Identifier b
  body:
    ReturnStatement
      BinaryExpression +
        Identifier a
        Identifier b
```

AST 的价值是：

> 它把代码从一段文本变成了可遍历、可查询、可定位的结构。

---

## 3. AST 在 AI IDE 中的作用

### 1. 找到当前函数

用户光标在某一行时，可以通过 AST 找到它属于哪个函数。

```text
光标位置：第 18 行
  ↓
AST 查询
  ↓
当前函数：handleSubmit
```

这样 Explain Code 就不只解释选区，还能知道外层函数背景。

### 2. 提取 import

AI 修改代码时，经常需要知道依赖来自哪里。

```ts
import { useState } from "react";
import { login } from "@/api/auth";
```

把 import 提取出来后，可以放进 Prompt：

```text
当前文件已有依赖：
- useState from react
- login from @/api/auth
```

### 3. 生成结构化代码摘要

对一个文件，可以提取：

```text
函数列表
类列表
导出成员
接口类型
调用关系
```

这比直接把整份文件塞给模型更省 Token。

### 4. 限定修改范围

如果用户要求“重构当前函数”，AST 可以帮你准确定位函数范围，然后只替换这个范围。

---

## 4. Babel Parser

Babel Parser 适合 JavaScript / TypeScript / JSX / TSX 解析。

安装：

```bash
npm install @babel/parser @babel/traverse
```

解析示例：

```ts
import { parse } from "@babel/parser";

const ast = parse(code, {
  sourceType: "module",
  plugins: ["typescript", "jsx"]
});
```

遍历函数：

```ts
import traverse from "@babel/traverse";

traverse(ast, {
  FunctionDeclaration(path) {
    console.log(path.node.id?.name);
  }
});
```

适合场景：

```text
前端项目
React / Vue 脚本分析
JS/TS 代码改写
教学 Demo
```

---

## 5. TS Compiler API

TS Compiler API 是 TypeScript 官方编译器 API。

它不仅能解析 AST，还能获取类型信息。

适合：

```text
TypeScript 项目深度分析
类型检查
符号跳转
查找定义
重构工具
```

简单示例：

```ts
import ts from "typescript";

const sourceFile = ts.createSourceFile(
  "demo.ts",
  code,
  ts.ScriptTarget.Latest,
  true
);

function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node)) {
    console.log(node.name?.getText(sourceFile));
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);
```

Babel 更适合语法转换和前端生态，TS Compiler API 更适合 TypeScript 类型语义。

---

## 6. Tree-sitter

Tree-sitter 是通用增量解析器。

特点：

```text
支持多语言
适合编辑器场景
能做增量解析
解析速度快
很多现代编辑器使用它做语法高亮和结构分析
```

适合：

- 多语言 AI IDE
- 代码编辑器
- 精确定位代码块
- 语法高亮
- 结构化代码索引

如果你要做类似 Cursor 的多语言工具，Tree-sitter 是很重要的技术方向。

---

## 7. 三者怎么选

| 工具 | 适合语言 | 核心优势 | 适合阶段 |
|------|----------|----------|----------|
| Babel Parser | JS / TS / JSX | 前端生态好，易上手 | 初学和前端项目 |
| TS Compiler API | TypeScript | 类型信息强 | TS 深度分析 |
| Tree-sitter | 多语言 | 快速、多语言、增量解析 | AI IDE / 编辑器 |

学习建议：

```text
先用 Babel Parser 理解 AST
再用 TS Compiler API 理解类型信息
最后了解 Tree-sitter 的多语言编辑器能力
```

---

## 8. 用 AST 做代码摘要

一个文件：

```ts
import { request } from "./request";

export async function getUser(id: string) {
  return request(`/users/${id}`);
}

export function formatName(name: string) {
  return name.trim();
}
```

可以摘要成：

```text
imports:
  - request from ./request

exports:
  - getUser(id: string): Promise<unknown>
  - formatName(name: string): string

functions:
  - getUser
  - formatName
```

这种摘要可以作为 AI 上下文，代替整份文件。

---

## 9. AST + LLM 的协作方式

AST 和 LLM 不是互相替代，而是分工协作。

```text
AST 负责：
  精确定位
  结构提取
  作用域分析
  函数边界

LLM 负责：
  语义理解
  自然语言解释
  代码生成
  重构建议
```

典型流程：

```text
用户点击 Explain Current Function
  ↓
Parser 找到当前函数范围
  ↓
提取函数代码、import、类型定义
  ↓
组装 Prompt
  ↓
LLM 解释代码
```

---

## 10. 常见误区

### 误区 1：有了 LLM 就不需要 AST

LLM 很强，但它不擅长稳定地做精确定位。

例如：

- “第 35 行属于哪个函数”
- “只替换这个函数体”
- “列出所有导出的函数”

这些更适合 Parser。

### 误区 2：AST 可以理解业务含义

AST 只理解语法结构，不理解业务意图。

例如 `calculatePremium` 是计算保险费用还是会员费用，AST 不知道。这个语义解释仍然要靠 LLM 和上下文。

### 误区 3：一开始就做全项目索引

初学阶段先做小闭环：

```text
解析当前文件
提取函数列表
找到当前选区所在函数
把结构化摘要给 LLM
```

不要一开始就做复杂代码库索引。

---

## 本节小结

AST / Parser 的核心价值是：

```text
把代码从字符串变成结构化数据
```

在 AI IDE 中，它主要解决：

- 当前代码块定位
- 函数和变量提取
- import / export 分析
- 上下文压缩
- 安全限定修改范围

掌握 AST 后，Mini Cursor 的代码理解能力会从“文本处理”升级为“结构化代码处理”。

