# 04 - VSCode 插件开发基础

## 文档目标

这份文档讲清楚：

> VSCode 插件如何运行，以及如何用插件能力实现 AI IDE 的基础功能。

学完后，你应该能理解：

- VSCode Extension 的运行模型
- `package.json` 在插件里的作用
- Command API 如何触发功能
- 如何读取当前编辑器、选区和文件内容
- Sidebar / Webview 如何承载 AI 交互界面

---

## 1. VSCode 插件是什么

VSCode 插件是运行在 VSCode Extension Host 里的程序。

它可以：

- 注册命令
- 读取当前打开的文件
- 获取用户选中的代码
- 修改编辑器内容
- 创建侧边栏
- 创建 Webview
- 读取工作区文件
- 调用外部 API

AI IDE 插件的常见功能：

```text
Explain Code
  读取选区 → 调用 AI → 展示解释

Refactor Code
  读取选区 → 生成修改结果 → 替换选区

Generate Code
  根据用户需求 → 生成代码 → 插入编辑器

Sidebar Chat
  提供 AI 对话面板，自动带上当前文件上下文
```

---

## 2. VSCode 插件目录结构

一个简化插件通常长这样：

```text
mini-cursor-extension/
├── package.json
├── src/
│   └── extension.ts
├── tsconfig.json
└── README.md
```

核心文件：

```text
package.json
  声明插件名称、命令、入口文件、激活时机

src/extension.ts
  插件主入口，注册命令和功能
```

---

## 3. package.json 的关键配置

示例：

```json
{
  "name": "mini-cursor",
  "displayName": "Mini Cursor",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.90.0"
  },
  "activationEvents": [
    "onCommand:miniCursor.explainCode",
    "onCommand:miniCursor.refactorCode"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "miniCursor.explainCode",
        "title": "Mini Cursor: Explain Code"
      },
      {
        "command": "miniCursor.refactorCode",
        "title": "Mini Cursor: Refactor Code"
      }
    ]
  }
}
```

关键字段：

| 字段 | 作用 |
|------|------|
| `activationEvents` | 什么时候激活插件 |
| `main` | 插件入口文件 |
| `contributes.commands` | 向 VSCode 注册命令 |
| `engines.vscode` | 支持的 VSCode 版本 |

---

## 4. 插件入口 activate

VSCode 插件入口通常是 `activate` 函数。

```ts
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const explainCommand = vscode.commands.registerCommand(
    "miniCursor.explainCode",
    async () => {
      vscode.window.showInformationMessage("Explain Code started");
    }
  );

  context.subscriptions.push(explainCommand);
}

export function deactivate() {}
```

重点：

> 插件激活后注册命令，命令触发时执行具体逻辑。

---

## 5. 读取当前编辑器和选区

Explain Code 的第一步是读取用户选中的代码。

```ts
const editor = vscode.window.activeTextEditor;

if (!editor) {
  vscode.window.showWarningMessage("请先打开一个代码文件");
  return;
}

const document = editor.document;
const selection = editor.selection;
const selectedText = document.getText(selection);

if (!selectedText.trim()) {
  vscode.window.showWarningMessage("请先选中一段代码");
  return;
}

const fileName = document.fileName;
const languageId = document.languageId;
```

这些信息可以组成 AI 上下文：

```text
文件路径：fileName
语言：languageId
选中代码：selectedText
```

---

## 6. 替换选区

Inline Edit / Refactor Code 需要把 AI 结果写回编辑器。

```ts
await editor.edit(editBuilder => {
  editBuilder.replace(selection, newCode);
});
```

工程建议：

- 替换前展示 Diff 或确认弹窗
- 限制只替换当前选区
- 失败时保留原代码
- 不要直接覆盖整份文件

---

## 7. Command API 适合做什么

Command 是 VSCode 插件最基础的交互入口。

适合：

```text
Explain Code
Refactor Selection
Generate Unit Test
Fix Error
Open AI Sidebar
```

用户可以通过：

- Command Palette
- 右键菜单
- 快捷键
- 按钮

触发命令。

---

## 8. Sidebar 和 Webview

如果只是弹一个提示，用 Command 就够了。

如果要做 AI 聊天面板，就需要 Webview。

Webview 是 VSCode 插件中的自定义网页界面。

```text
VSCode Extension Host
  插件后端逻辑
      ↓
Webview
  HTML / CSS / JS UI
      ↓
Message Passing
  Webview 和插件主进程通信
```

示例：创建 Webview Panel。

```ts
const panel = vscode.window.createWebviewPanel(
  "miniCursorChat",
  "Mini Cursor",
  vscode.ViewColumn.Beside,
  {
    enableScripts: true
  }
);

panel.webview.html = `
  <html>
    <body>
      <h1>Mini Cursor</h1>
      <textarea id="input"></textarea>
      <button id="send">Send</button>
    </body>
  </html>
`;
```

---

## 9. Webview 和插件通信

Webview 不能直接调用 VSCode API。它需要通过消息通信。

Webview 发消息：

```js
const vscode = acquireVsCodeApi();

vscode.postMessage({
  type: "ASK_AI",
  text: input.value
});
```

插件接收消息：

```ts
panel.webview.onDidReceiveMessage(async message => {
  if (message.type === "ASK_AI") {
    const answer = await callAI(message.text);
    panel.webview.postMessage({
      type: "AI_RESULT",
      answer
    });
  }
});
```

通信模型和 Chrome Extension 很像：

```text
Webview UI
  ↓ postMessage
Extension Host
  ↓ call AI / read file / edit document
Webview UI
```

---

## 10. AI 插件的基础流程

Explain Code：

```text
用户选中代码
  ↓
触发命令 Mini Cursor: Explain Code
  ↓
插件读取 activeTextEditor 和 selection
  ↓
组装 Prompt
  ↓
调用 LLM
  ↓
把解释显示到 Webview 或 Output Channel
```

Refactor Code：

```text
用户选中代码
  ↓
输入重构要求
  ↓
插件读取选区和周围上下文
  ↓
调用 LLM 生成新代码
  ↓
展示确认
  ↓
替换选区
```

---

## 本节小结

VSCode 插件开发的核心是：

```text
package.json 声明能力
activate 注册命令
activeTextEditor 读取上下文
editor.edit 写回代码
Webview 承载复杂 AI UI
```

掌握这些能力后，就可以实现 Mini Cursor 的基础版本。

