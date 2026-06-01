# 05 - Monaco 与 CodeMirror 编辑器基础

## 文档目标

这份文档讲清楚：

> Monaco Editor 和 CodeMirror 在 AI IDE 里的作用，以及如何理解编辑器的文本模型、选区和编辑操作。

学完后，你应该能理解：

- 为什么 AI IDE 需要代码编辑器内核
- Monaco Editor 和 CodeMirror 的定位
- 文本模型、光标、选区、编辑操作是什么
- AI Inline Edit 如何基于编辑器 API 实现

---

## 1. 为什么要学编辑器

如果你要做 Mini Cursor，有两种路线：

```text
路线 1：做 VSCode 插件
  直接利用 VSCode 自带编辑器

路线 2：做独立 Web IDE
  需要自己集成代码编辑器
```

独立 Web IDE 不能只用 `<textarea>`。原因是：

- 代码需要语法高亮
- 需要行号
- 需要缩进处理
- 需要光标和选区 API
- 需要快捷键
- 需要多文件编辑
- 需要 Diff 和补全能力

这就是 Monaco 和 CodeMirror 的价值。

---

## 2. Monaco Editor 是什么

Monaco Editor 是 VSCode 使用的 Web 编辑器内核。

特点：

```text
能力强
接近 VSCode 编辑体验
支持 TypeScript / JavaScript 语言服务
体积相对较大
适合复杂 Web IDE
```

适合场景：

- 在线代码编辑器
- Web IDE
- 代码练习平台
- Mini Cursor 独立编辑器

---

## 3. CodeMirror 是什么

CodeMirror 是一个轻量、可扩展的 Web 代码编辑器。

特点：

```text
体积更轻
插件化架构
可定制性强
适合嵌入式编辑场景
```

适合场景：

- 文档里的代码块编辑
- 小型脚本编辑器
- SQL 编辑器
- 配置编辑器
- 轻量 AI 编辑器

---

## 4. Monaco 和 CodeMirror 怎么选

| 维度 | Monaco | CodeMirror |
|------|--------|------------|
| 体验 | 接近 VSCode | 更轻量 |
| 体积 | 较大 | 较小 |
| TypeScript 支持 | 强 | 需要更多配置 |
| 定制成本 | 中等 | 高度可定制 |
| 适合项目 | Web IDE / Mini Cursor | 嵌入式编辑器 / 轻量工具 |

学习建议：

> 做 Mini Cursor 独立编辑器时，优先用 Monaco，因为它和 VSCode 心智模型更接近。

---

## 5. 编辑器的核心概念

无论使用 Monaco 还是 CodeMirror，都要理解四个概念。

### 1. 文本模型

文本模型保存编辑器里的代码内容。

```text
model = 当前文件内容 + 语言类型 + 行列位置映射
```

你从模型里读取代码，而不是直接读 DOM。

### 2. 光标

光标代表用户当前输入位置。

```text
lineNumber: 第几行
column: 第几列
```

### 3. 选区

选区代表用户选中的代码范围。

```text
startLineNumber
startColumn
endLineNumber
endColumn
```

AI Inline Edit 通常基于选区工作。

### 4. 编辑操作

编辑操作是对文本模型的修改：

```text
insert
replace
delete
```

AI 生成的新代码最终必须转成编辑器能执行的编辑操作。

---

## 6. Monaco 基础示例

创建编辑器：

```ts
import * as monaco from "monaco-editor";

const editor = monaco.editor.create(document.getElementById("root")!, {
  value: `function hello() {\n  console.log("hello");\n}`,
  language: "typescript",
  theme: "vs-dark",
  automaticLayout: true
});
```

读取全部代码：

```ts
const code = editor.getValue();
```

读取选区：

```ts
const selection = editor.getSelection();
const model = editor.getModel();

if (selection && model) {
  const selectedText = model.getValueInRange(selection);
}
```

替换选区：

```ts
editor.executeEdits("ai-inline-edit", [
  {
    range: selection,
    text: newCode,
    forceMoveMarkers: true
  }
]);
```

---

## 7. Inline Edit 的编辑器流程

```text
用户选中代码
  ↓
editor.getSelection()
  ↓
model.getValueInRange(selection)
  ↓
把 selectedText + instruction 发给 AI
  ↓
AI 返回 newCode
  ↓
editor.executeEdits 替换选区
```

关键点：

> 选区就是 AI 修改的边界。

如果用户没有选中代码，可以选择：

- 提示用户先选中代码
- 自动扩展到当前函数
- 自动扩展到当前行

初学阶段建议先要求用户明确选区。

---

## 8. 为什么需要 Diff

直接替换选区虽然简单，但用户不知道 AI 改了什么。

更好的流程：

```text
AI 返回 newCode
  ↓
生成 oldCode 和 newCode 的 Diff
  ↓
展示新增、删除、修改
  ↓
用户确认
  ↓
再执行替换
```

Monaco 本身支持 Diff Editor：

```ts
const diffEditor = monaco.editor.createDiffEditor(container);

diffEditor.setModel({
  original: monaco.editor.createModel(oldCode, "typescript"),
  modified: monaco.editor.createModel(newCode, "typescript")
});
```

---

## 9. AI 编辑器的上下文策略

给模型的上下文可以分层：

```text
必需：
  用户选中的代码
  用户的修改要求

建议：
  文件语言
  文件名
  选区前后若干行

高级：
  当前函数 AST
  相关 import
  类型定义
  同项目类似代码
```

初学阶段可以先实现：

```text
selectedText + instruction + language
```

不要一开始就做全项目索引。

---

## 10. 常见问题

### 问题 1：AI 返回 Markdown 代码块

模型可能返回：

````text
```ts
const a = 1;
```
````

替换前要清理代码围栏。

### 问题 2：缩进丢失

Prompt 里要要求：

```text
保持原代码缩进风格。
只返回代码，不要解释。
```

### 问题 3：修改范围过大

如果让模型处理整份文件，它可能重写无关代码。

更好的方式：

```text
只发送选区和必要上下文，只替换选区。
```

---

## 本节小结

Monaco 和 CodeMirror 是 AI IDE 的编辑器基础。

你需要重点掌握：

```text
读取全部代码
读取当前选区
获取光标位置
替换指定范围
展示 Diff
```

这些能力串起来，就是 Mini Cursor 里 Inline Edit 的基础。

