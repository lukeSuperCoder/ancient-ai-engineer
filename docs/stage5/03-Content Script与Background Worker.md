# 03 - Content Script 与 Background Worker

## 文档目标

这份文档讲清楚：

> Chrome 插件里 Content Script 和 Background Worker 分别负责什么，以及它们如何协作。

学完后，你应该能理解：

- 为什么 Content Script 和 Background Worker 要分层
- Content Script 如何读取网页和选区
- Background Worker 如何处理 API 调用和状态
- 插件内部消息通信怎么设计
- AI 网页助手的数据流应该怎么走

---

## 1. 为什么要分 Content Script 和 Background Worker

AI 网页助手要同时做两件事：

```text
1. 读取当前网页内容
2. 调用 AI 接口并管理结果
```

这两件事不适合放在同一个地方。

```text
Content Script:
  离网页最近，适合读取 DOM、获取用户选区、插入页面浮层

Background Worker:
  离浏览器运行时更近，适合统一处理消息、调用 API、管理状态
```

一句话：

> Content Script 负责“页面现场”，Background Worker 负责“插件后台”。

---

## 2. Content Script 能做什么

Content Script 会被注入到网页中，因此它可以访问页面 DOM。

常见能力：

```text
读取 document.title
读取 location.href
读取 document.body.innerText
获取 window.getSelection()
监听鼠标划词
向页面插入浮层
给页面元素绑定事件
```

示例：获取页面上下文。

```js
function getPageContext() {
  const selection = window.getSelection()?.toString() || "";

  return {
    title: document.title,
    url: location.href,
    selectedText: selection.trim(),
    pageText: document.body.innerText.slice(0, 12000)
  };
}
```

---

## 3. Content Script 不适合做什么

Content Script 不应该承载所有逻辑。

不建议放在 Content Script 里的内容：

- API Key 明文逻辑
- 复杂状态管理
- 多标签页共享数据
- 长任务调度
- 插件全局配置

原因是：

- Content Script 每个页面都可能注入一份
- 页面环境复杂，容易受页面脚本和样式影响
- 多标签页之间不好共享状态

---

## 4. Background Worker 能做什么

Background Worker 是插件后台脚本。

常见能力：

```text
监听插件事件
接收 Popup / Content Script 消息
调用远程 AI API
读写 chrome.storage
管理插件配置
统一处理错误
```

示例：处理 AI 请求。

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AI_SUMMARIZE") {
    summarizePage(message.payload)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }
});
```

---

## 5. Background Worker 的限制

Manifest V3 里的 Background Worker 不是常驻进程。

你不能假设：

```js
let cache = {};
```

这个变量永远存在。

更可靠的方式是：

```js
await chrome.storage.local.set({
  lastSummary: result
});
```

需要记住：

- Worker 可能被浏览器停止
- 内存状态可能丢失
- 重要状态要存入 `chrome.storage`
- 异步消息要 `return true`

---

## 6. 插件内部消息通信

Chrome 插件常见通信方向：

```text
Popup → Content Script
  获取页面内容、获取选区

Popup → Background Worker
  请求调用 AI、读取配置

Content Script → Background Worker
  用户划词后请求解释

Background Worker → Content Script
  返回解释结果、要求插入浮层
```

### Popup 向 Content Script 发消息

```js
const [tab] = await chrome.tabs.query({
  active: true,
  currentWindow: true
});

const context = await chrome.tabs.sendMessage(tab.id, {
  type: "GET_PAGE_CONTEXT"
});
```

### Content Script 接收消息

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse(getPageContext());
  }
});
```

### Popup 向 Background Worker 发消息

```js
const response = await chrome.runtime.sendMessage({
  type: "AI_SUMMARIZE",
  payload: context
});
```

---

## 7. AI 网页助手推荐数据流

网页总结：

```text
用户点击 Popup 的“总结”
  ↓
Popup 向 Content Script 请求页面上下文
  ↓
Content Script 返回 title、url、pageText
  ↓
Popup 向 Background Worker 发送 AI_SUMMARIZE
  ↓
Background Worker 调用 AI 接口
  ↓
Popup 展示总结结果
```

高亮解释：

```text
用户在页面上选中文本
  ↓
Content Script 捕获 selectedText
  ↓
用户点击浮动按钮“解释”
  ↓
Content Script 向 Background Worker 发送 AI_EXPLAIN
  ↓
Background Worker 调用 AI 接口
  ↓
Content Script 在页面浮层展示解释
```

---

## 8. 页面正文提取策略

最简单的方式：

```js
document.body.innerText
```

但它会包含很多噪声：

- 导航栏
- 页脚
- 广告
- 推荐列表
- 评论区
- 按钮文字

更好的方式是：

```text
1. 优先读取 article 标签
2. 其次读取 main 标签
3. 删除 script、style、nav、footer、aside
4. 合并段落文本
5. 限制最大长度
```

示例：

```js
function extractReadableText() {
  const root = document.querySelector("article") ||
    document.querySelector("main") ||
    document.body;

  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, style, nav, footer, aside").forEach(node => {
    node.remove();
  });

  return clone.innerText
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
}
```

---

## 9. Prompt 组装示例

网页总结 Prompt：

```text
你是网页内容总结助手。

网页标题：{{title}}
网页 URL：{{url}}

网页正文：
{{pageText}}

请用中文输出：
1. 核心结论
2. 关键要点
3. 值得注意的细节
```

高亮解释 Prompt：

```text
你是阅读辅助助手。

用户选中的文本：
{{selectedText}}

它所在网页标题：
{{title}}

请解释这段文本的含义，并说明它在上下文中可能指什么。
```

---

## 10. 常见错误

### 错误 1：Popup 直接读 DOM

Popup 是插件页面，不是目标网页。它不能直接读取当前网页 DOM。

正确方式：

```text
Popup → Content Script → 网页 DOM
```

### 错误 2：忘记异步 return true

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  fetch("/api").then(result => sendResponse(result));
  return true;
});
```

没有 `return true` 时，异步 `sendResponse` 可能失效。

### 错误 3：把所有页面文本都发给模型

工程上必须限制长度：

```js
const MAX_CONTEXT_CHARS = 12000;
```

否则会导致：

- 请求慢
- 成本高
- 超出模型上下文
- 总结质量下降

---

## 本节小结

Content Script 和 Background Worker 的分工可以这样记：

```text
Content Script:
  读取页面、获取选区、插入浮层

Background Worker:
  调 API、管配置、做后台调度

Message Passing:
  把不同运行环境连接起来
```

掌握这套通信模型后，就可以开始实现 AI 网页助手插件。

---

## 附录 A：Selection API 详解

### 获取选中文本

`window.getSelection()` 返回 `Selection` 对象：

```js
const sel = window.getSelection();
const text = sel?.toString().trim();  // 选中的纯文本
```

### 获取选区坐标（用于浮层定位）

光知道选中了什么文字还不够，还要知道选区在屏幕上的位置，才能把浮层定位到文字上方：

```js
const sel = window.getSelection();
const range = sel.getRangeAt(0);
const rect = range.getBoundingClientRect();

// rect 包含：top, right, bottom, left, width, height
// 这些值是相对视口的像素坐标
```

`getBoundingClientRect()` 返回的是相对视口（viewport）的坐标。如果页面有滚动，需要加上 `window.scrollX` 和 `window.scrollY` 转为页面绝对坐标：

```js
const top = rect.top + window.scrollY;
const left = rect.left + window.scrollX;
```

### 监听选区事件

在 `mouseup` 事件中检测选区，用 `setTimeout` 延迟确保选区已更新：

```js
document.addEventListener("mouseup", () => {
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 2) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    showToolbar(rect);  // 在选区上方弹出浮层
  }, 10);
});
```

为什么用 `setTimeout`：鼠标松开的瞬间，浏览器的选区可能还没完全更新。延迟 10ms 确保选区状态已确定。

### 防止浮层干扰选区

浮层本身也会触发 `mousedown`/`mouseup` 事件，可能导致选区丢失。需要判断点击是否在浮层内部：

```js
document.addEventListener("mousedown", (e) => {
  // 如果点击在浮层内部，不移除浮层
  if (panelHost.contains(e.target)) return;
  removePanel();
});
```

---

## 附录 B：两种 sendMessage 的区别

```text
chrome.runtime.sendMessage()
  发给同插件内的其他脚本（background、popup）
  不需要指定目标，广播式
  用于：Content Script → Background Worker，Popup → Background Worker

chrome.tabs.sendMessage(tabId, ...)
  发给指定标签页的 Content Script
  必须提供 tabId（通过 chrome.tabs.query 获取）
  用于：Popup → Content Script，Background Worker → Content Script
```

### 完整数据流示例

AI 网页助手最核心的一次交互：

```text
用户选中文字 → mouseup 事件
  ↓
content.js: window.getSelection() 获取文本和坐标
  ↓
content.js: chrome.runtime.sendMessage({ type: "AI_REQUEST" })
  ↓                                                    ↙ 同一插件内部通信
  background.js: 收到消息，调用 AI API
  ↓
  background.js: sendResponse({ ok: true, result: "AI回答" })
  ↓                                                    ↙ sendResponse 原路返回
  content.js: 收到 response，在页面浮层展示结果
```

整个过程只用了 `chrome.runtime.sendMessage`，因为 content.js → background.js 是同一插件内部通信。

---

## 附录 C：异步 sendResponse 与 return true

这是最常见的坑。`onMessage` 监听器默认是同步的，函数返回后 Chrome 会关闭消息通道：

```js
// ❌ 错误：异步 sendResponse 会失效
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  fetch("/api").then(result => sendResponse(result));
  // 函数到这里就返回了，Chrome 关闭通道，sendResponse 调用无效
});

// ✅ 正确：return true 告诉 Chrome 保持通道
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  fetch("/api").then(result => sendResponse(result));
  return true;  // 告诉 Chrome："我会异步调用 sendResponse，别关闭通道"
});
```

规则很简单：**只要 `sendResponse` 在异步操作（fetch、Promise、setTimeout）里被调用，就必须 `return true`。**

---

## 附录 D：HTML 安全渲染

AI 返回的结果可能包含 HTML 格式（加粗、列表等），但不能直接用 `innerHTML` 渲染，因为有 XSS 风险。需要用白名单过滤器：

```js
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "mark",
  "p", "br", "ul", "ol", "li", "h3", "h4",
  "blockquote", "code", "span"
]);

function sanitizeHtml(raw) {
  const doc = new DOMParser().parseFromString(raw, "text/html");

  const walk = (node) => {
    const remove = [];
    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
          // 不在白名单的标签：保留其子内容，去掉标签本身
          remove.push(child);
        } else {
          // 去掉所有属性（防止 onclick 等）
          for (const attr of [...child.attributes]) {
            child.removeAttribute(attr.name);
          }
          walk(child);
        }
      }
    }
    remove.forEach(el => el.replaceWith(...el.childNodes));
  };

  walk(doc.body);
  return doc.body.innerHTML;
}
```

使用方式：

```js
// 错误消息：纯文本渲染（转义）
errorDiv.textContent = error.message;

// AI 结果：HTML 渲染（过滤后）
resultDiv.innerHTML = sanitizeHtml(aiResponse);
```

`textContent` 和 `innerHTML` 的区别：
- `textContent` 会转义所有 HTML 标签，适合错误信息
- `innerHTML` 会解析 HTML，只用于经过过滤的内容

