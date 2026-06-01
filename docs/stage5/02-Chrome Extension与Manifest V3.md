# 02 - Chrome Extension 与 Manifest V3

## 文档目标

这份文档讲清楚：

> Chrome Extension 是什么，以及 Manifest V3 为什么是插件开发的入口。

学完后，你应该能理解：

- Chrome Extension 的基本组成
- `manifest.json` 的作用
- Manifest V3 的核心变化
- Popup、Content Script、Background Worker 的关系
- AI 网页助手插件需要哪些权限

---

## 1. Chrome Extension 是什么

Chrome Extension 是运行在 Chrome 浏览器里的小型应用。

它可以：

- 在工具栏显示按钮
- 读取当前标签页信息
- 向页面注入脚本
- 操作浏览器存储
- 监听浏览器事件
- 和远程 API 通信

AI 网页助手插件通常会做这些事：

```text
读取当前网页内容
  ↓
用户点击总结 / 翻译 / 解释
  ↓
插件调用 AI 接口
  ↓
在 Popup 或侧边栏展示结果
```

---

## 2. 插件的基本目录结构

一个最小插件通常长这样：

```text
ai-web-assistant/
├── manifest.json
├── popup.html
├── popup.js
├── content.js
├── background.js
└── icons/
    └── icon.png
```

各文件职责：

```text
manifest.json
  插件配置文件，声明名称、权限、入口文件

popup.html / popup.js
  点击浏览器工具栏图标后显示的界面

content.js
  注入到网页里的脚本，可以读取页面 DOM 和用户选区

background.js
  后台 Service Worker，处理长生命周期逻辑、转发消息、调用接口
```

---

## 3. manifest.json 是什么

`manifest.json` 是插件的“身份证”和“配置中心”。

它告诉 Chrome：

- 插件叫什么
- 用哪个 Manifest 版本
- 有哪些权限
- Popup 页面在哪里
- Content Script 注入哪些页面
- Background Worker 文件在哪里

最小示例：

```json
{
  "manifest_version": 3,
  "name": "AI Web Assistant",
  "version": "0.1.0",
  "description": "Summarize, translate, and explain web pages with AI.",
  "action": {
    "default_popup": "popup.html"
  },
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["https://api.example.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ]
}
```

---

## 4. Manifest V3 的核心变化

Manifest V3 是 Chrome 当前主推的插件规范。

它和旧版 Manifest V2 最大的变化是：

```text
Manifest V2:
  background page 常驻后台

Manifest V3:
  background service worker 按需唤醒，不常驻
```

这意味着：

- 后台脚本不能假设自己一直在运行
- 不适合把长期状态只放在内存变量里
- 需要用 `chrome.storage` 保存重要状态
- 异步任务要设计得更短、更明确

---

## 5. 插件的几个运行位置

Chrome Extension 不是一个单一 JS 程序，而是多个运行位置协作。

```text
Popup
  用户界面，适合按钮、输入框、结果展示

Content Script
  运行在网页上下文附近，适合读取 DOM、获取选区

Background Worker
  后台事件处理，适合转发消息、调用 API、管理状态

Options Page
  插件设置页，适合配置 API Key、默认语言等
```

### 为什么要分这么多层

因为每一层权限不同。

Popup 不能直接像页面脚本一样读取网页 DOM。Content Script 可以读取 DOM，但不适合直接承载所有 UI 和后台逻辑。Background Worker 适合做统一调度，但不能直接操作页面 DOM。

---

## 6. AI 网页助手需要的权限

常见权限：

```json
{
  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "https://api.openai.com/*"
  ]
}
```

权限解释：

| 权限 | 作用 |
|------|------|
| `activeTab` | 获取当前激活标签页的临时访问权限 |
| `storage` | 保存用户设置、历史记录、API Key 等 |
| `scripting` | 动态注入脚本 |
| `host_permissions` | 允许访问指定远程 API |

工程建议：

> 权限越少越好。只声明当前功能真正需要的权限。

---

## 7. Popup 的基本工作方式

Popup 是用户点击插件图标后弹出的页面。

```html
<!-- popup.html -->
<button id="summarize">总结页面</button>
<button id="translate">翻译选区</button>
<pre id="result"></pre>
<script src="popup.js"></script>
```

```js
// popup.js
document.getElementById("summarize").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "GET_PAGE_TEXT"
  });

  document.getElementById("result").textContent = response.text;
});
```

这里的关键是：

> Popup 自己不读网页内容，而是发消息给 Content Script。

---

## 8. Content Script 的基本工作方式

Content Script 可以读取当前网页。

```js
// content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_TEXT") {
    sendResponse({
      title: document.title,
      url: location.href,
      text: document.body.innerText.slice(0, 12000)
    });
  }
});
```

注意：

- `document.body.innerText` 很粗糙，真实项目要做正文提取
- 要限制文本长度，避免 Token 爆炸
- 要过滤导航栏、广告、脚本内容等噪声

---

## 9. Background Worker 的基本工作方式

Background Worker 适合做统一调度。

```js
// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CALL_AI") {
    callAI(message.payload)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true; // 异步 sendResponse 必须返回 true
  }
});
```

容易踩坑的点：

> 在 `onMessage` 里异步返回结果时，需要 `return true`，否则消息通道可能提前关闭。

---

## 10. 插件加载与调试

本地开发步骤：

```text
1. 打开 chrome://extensions
2. 开启 Developer mode
3. 点击 Load unpacked
4. 选择插件目录
5. 修改代码后点击 Reload
```

调试入口：

```text
Popup:
  右键插件 Popup → Inspect

Content Script:
  打开目标网页 DevTools → Console / Sources

Background Worker:
  chrome://extensions → 插件详情 → service worker inspect
```

---

## 10. Content Script 动态注入

`manifest.json` 的 `content_scripts` 只在页面**新加载时**自动注入。如果用户在插件加载之前已经打开了页面，Content Script 不会存在于该页面上，`sendMessage` 会失败。

这时需要用 `chrome.scripting.executeScript` 动态注入：

```js
// popup.js 或 background.js 中
try {
  // 先尝试发消息
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "GET_PAGE_CONTEXT"
  });
} catch {
  // Content Script 不存在，手动注入
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  // 注入后再发消息
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "GET_PAGE_CONTEXT"
  });
}
```

注意 `chrome.scripting` 需要在 `manifest.json` 中声明 `scripting` 权限。

---

## 11. Content Script 样式隔离（Shadow DOM）

Content Script 注入的 UI 元素会被宿主页面的 CSS 影响。比如页面设置了 `div { color: red }`，你注入的浮层文字也会变红。

解决方案是使用 **Shadow DOM**：

```js
const host = document.createElement("div");
host.id = "my-extension-host";

const shadow = host.attachShadow({ mode: "closed" });
shadow.innerHTML = `
  <style>
    /* 这里的样式完全隔离，不受页面影响 */
    .panel { background: #fff; color: #333; }
  </style>
  <div class="panel">Hello</div>
`;

document.body.appendChild(host);
```

Shadow DOM 内外的 CSS 完全隔离：
- 外部样式不会穿透进 Shadow DOM
- Shadow DOM 内的样式不会泄漏到外部
- 页面的全局 CSS reset 也不会影响你的 UI

这是浏览器原生能力，不需要任何 polyfill。`mode: "closed"` 表示外部 JS 无法通过 `host.shadowRoot` 访问内部。

---

## 本节小结

Chrome Extension 的核心不是某个 API，而是运行模型：

```text
manifest.json 声明能力
Popup 提供界面
Content Script 读取页面（可用 Shadow DOM 隔离样式）
Background Worker 处理后台逻辑
各部分通过 message 通信
Content Script 可动态注入，解决已打开页面的问题
```

下一节重点学习 Content Script 和 Background Worker 的通信边界，这是 AI 网页助手最核心的工程基础。

