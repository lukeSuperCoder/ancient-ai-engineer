# 08 - Mini Cursor：AI 代码编辑器实战指南

## 项目目标

本项目要实现一个简化版 Mini Cursor。

核心能力：

```text
Explain Code
Refactor Code
Generate Code
Inline Edit
```

你可以选择两种实现路线：

```text
路线 A：VSCode 插件
  更接近真实开发工作流，复用 VSCode 编辑器能力

路线 B：Web 版 Mini IDE
  使用 Monaco Editor，自建编辑器界面
```

初学建议：

> 如果目标是理解 AI IDE 原理，先做 Web 版 Mini IDE；如果目标是贴近真实工具生态，再做 VSCode 插件版。

---

## 1. 功能拆解

### Explain Code

```text
读取用户选中的代码
  ↓
组装文件名、语言、选区
  ↓
调用 AI
  ↓
在侧边栏展示解释
```

### Refactor Code

```text
读取选区
  ↓
用户输入重构要求
  ↓
AI 返回重构后的代码
  ↓
展示 Diff
  ↓
确认后替换选区
```

### Generate Code

```text
用户输入需求
  ↓
读取当前文件上下文
  ↓
AI 生成代码
  ↓
插入到光标位置或新建文件
```

### Inline Edit

```text
用户选中代码
  ↓
输入修改指令
  ↓
AI 只返回修改后的选区
  ↓
替换选区
```

---

## 2. Web 版推荐架构

```text
前端
  Monaco Editor
  AI Sidebar
  Diff Preview
  Command Bar

后端
  /api/ai/explain
  /api/ai/refactor
  /api/ai/generate
  /api/ai/inline-edit

代码理解层
  Babel Parser / TS Compiler API
```

数据流：

```text
Editor Selection
  ↓
Context Builder
  ↓
Prompt Template
  ↓
LLM API
  ↓
Result Parser
  ↓
Diff / Apply Edit
```

---

## 3. Monaco 编辑器基础

读取选区：

```ts
function getSelectedCode(editor: monaco.editor.IStandaloneCodeEditor) {
  const model = editor.getModel();
  const selection = editor.getSelection();

  if (!model || !selection) {
    return "";
  }

  return model.getValueInRange(selection);
}
```

替换选区：

```ts
function replaceSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
  newCode: string
) {
  const selection = editor.getSelection();
  if (!selection) return;

  editor.executeEdits("ai-inline-edit", [
    {
      range: selection,
      text: newCode,
      forceMoveMarkers: true
    }
  ]);
}
```

读取周围上下文：

```ts
function getSurroundingContext(
  model: monaco.editor.ITextModel,
  selection: monaco.Selection,
  linePadding = 20
) {
  const startLine = Math.max(1, selection.startLineNumber - linePadding);
  const endLine = Math.min(
    model.getLineCount(),
    selection.endLineNumber + linePadding
  );

  return model.getValueInRange({
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: model.getLineMaxColumn(endLine)
  });
}
```

---

## 4. Context Builder

Context Builder 负责把编辑器状态变成模型可用的上下文。

```ts
type CodeContext = {
  fileName: string;
  language: string;
  selectedCode: string;
  surroundingCode: string;
  instruction?: string;
};
```

构建上下文：

```ts
function buildCodeContext(editor, fileName, language, instruction) {
  const model = editor.getModel();
  const selection = editor.getSelection();

  if (!model || !selection) {
    throw new Error("Editor is not ready");
  }

  return {
    fileName,
    language,
    selectedCode: model.getValueInRange(selection),
    surroundingCode: getSurroundingContext(model, selection),
    instruction
  };
}
```

为什么要有 Context Builder：

> 避免每个功能都自己拼上下文，保证 Explain、Refactor、Inline Edit 使用一致的数据结构。

---

## 5. Explain Code Prompt

````text
你是一个代码讲解助手。

文件名：{{fileName}}
语言：{{language}}

用户选中的代码：
```{{language}}
{{selectedCode}}
```

附近上下文：
```{{language}}
{{surroundingCode}}
```

请用中文解释：
1. 这段代码的作用
2. 核心执行流程
3. 输入输出分别是什么
4. 可能的风险或注意事项
````

Explain Code 只展示解释，不修改代码。

---

## 6. Inline Edit Prompt

Inline Edit 必须严格控制输出。

````text
你是一个代码编辑助手。

文件名：{{fileName}}
语言：{{language}}

用户要求：
{{instruction}}

用户选中的代码：
```{{language}}
{{selectedCode}}
```

附近上下文：
```{{language}}
{{surroundingCode}}
```

请只返回修改后的选中代码。
不要返回 Markdown 代码块。
不要解释。
不要修改选区之外的代码。
保持原有缩进风格。
````

为什么要强调“只返回代码”：

> 因为返回结果会直接用于替换选区，解释文字会污染代码。

---

## 7. Refactor Code 流程

Refactor 和 Inline Edit 很像，但更强调“为什么改”和“改了什么”。

推荐让模型返回结构化结果：

```json
{
  "summary": "把重复的判断逻辑提取为 helper 函数",
  "newCode": "function ...",
  "notes": [
    "保持原函数签名不变",
    "没有修改外部调用方式"
  ]
}
```

这样 UI 可以展示：

```text
修改摘要
Diff 对比
注意事项
Apply / Cancel 按钮
```

工程上不要一拿到结果就覆盖代码。

---

## 8. Generate Code 流程

Generate Code 通常不是替换选区，而是插入代码。

```text
用户输入需求：
  “帮我生成一个 debounce 函数”

上下文：
  当前语言 TypeScript
  当前文件已有 import
  当前光标位置

AI 输出：
  函数代码

执行：
  插入到光标位置
```

Prompt：

````text
你是代码生成助手。

语言：{{language}}
当前文件上下文：
```{{language}}
{{surroundingCode}}
```

用户需求：
{{instruction}}

请只返回要插入的代码，不要解释。
````

---

## 9. 引入 AST 增强代码理解

基础版可以只用选区和周围上下文。

增强版可以加入 AST：

```text
当前文件 import 列表
当前函数名称
当前函数参数
当前文件导出成员
```

示例结构：

```ts
type AstSummary = {
  imports: string[];
  currentFunction?: string;
  exportedNames: string[];
};
```

Prompt 中加入：

```text
当前文件结构摘要：
{{astSummary}}
```

这样模型更容易保持一致的命名和依赖使用方式。

---

## 10. Diff Preview

Diff 是 AI 代码编辑器的安全阀。

```text
oldCode
  ↓
AI newCode
  ↓
Diff Preview
  ↓
用户点击 Apply
  ↓
replaceSelection
```

用户需要能看到：

- 删除了哪些行
- 新增了哪些行
- 修改是否超出预期
- 是否破坏缩进和格式

如果使用 Monaco，可以用 Diff Editor。如果做 VSCode 插件，可以使用 VSCode 的 diff 视图或先用预览面板展示。

---

## 11. 错误处理

需要处理：

```text
没有打开文件
没有选中代码
AI 返回为空
AI 返回 Markdown 代码块
替换选区失败
生成代码语言不匹配
请求超时
```

建议策略：

- Explain Code 没有选区时提示用户选择代码
- Inline Edit 必须要求选区
- Generate Code 可以允许无选区，但必须有插入位置
- Apply 前保留旧代码，方便撤销

---

## 12. 完成标准

Web 版 Mini Cursor 完成标准：

```text
页面包含 Monaco 编辑器
可以选中代码
Explain Code 能解释选区
Inline Edit 能根据指令修改选区
Refactor Code 能展示修改前后差异
Generate Code 能插入新代码
有基础错误提示
不会在未确认时直接大范围覆盖代码
```

VSCode 插件版完成标准：

```text
能在 VSCode 中加载插件
能注册 Explain / Refactor / Generate 命令
能读取 activeTextEditor 和 selection
能在 Webview 或面板展示 AI 结果
能替换当前选区
能处理没有选区、没有文件等错误
```

---

## 项目复盘问题

完成后你应该能回答：

- Mini Cursor 和普通聊天机器人有什么区别？
- 为什么 Inline Edit 必须限制修改范围？
- 为什么要展示 Diff？
- Context Builder 解决了什么问题？
- AST 在代码理解里提供了什么帮助？
- VSCode 插件版和 Web IDE 版的技术边界分别是什么？
