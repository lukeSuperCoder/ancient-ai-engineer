// content.js — Content Script with floating panel

// ── Page text extraction ──

function extractReadableText() {
  const root =
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.body;

  const clone = root.cloneNode(true);
  clone
    .querySelectorAll("script, style, nav, footer, aside, header")
    .forEach((node) => node.remove());

  return clone.innerText
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
}

function getPageContext() {
  const selection = window.getSelection()?.toString().trim() || "";

  return {
    title: document.title,
    url: location.href,
    selectedText: selection,
    pageText: extractReadableText(),
  };
}

// ── Floating panel UI ──

const HOST_ID = "ai-wa-host";

function createPanel() {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: absolute;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        color: #1a1a2e;
      }

      .toolbar {
        display: flex;
        gap: 4px;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.04);
        padding: 4px;
        animation: ai-wa-in .15s ease;
      }

      .toolbar button {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: #4a4d5e;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        font-family: inherit;
      }

      .toolbar button:hover {
        background: #f0edff;
        color: #5b4cc4;
      }

      .toolbar button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      .toolbar .icon {
        font-size: 13px;
        line-height: 1;
      }

      @keyframes ai-wa-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── result panel ── */

      .result-panel {
        width: 360px;
        max-height: 320px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 6px 28px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.04);
        overflow: hidden;
        animation: ai-wa-in .15s ease;
        display: flex;
        flex-direction: column;
      }

      .result-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid #eee;
      }

      .result-header .title {
        font-size: 12px;
        font-weight: 600;
        color: #2d3561;
      }

      .result-header .close-btn {
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #8b8fa3;
        font-size: 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: inherit;
      }

      .result-header .close-btn:hover {
        background: #f0f0f4;
        color: #2d3561;
      }

      .result-body {
        padding: 12px 14px;
        overflow-y: auto;
        max-height: 260px;
        font-size: 13px;
        line-height: 1.7;
        color: #2d3561;
        word-break: break-word;
      }

      .result-body.error {
        color: #e74c3c;
      }

      .result-body b, .result-body strong {
        font-weight: 600;
        color: #1a1a2e;
      }

      .result-body mark {
        background: #fde68a;
        border-radius: 2px;
        padding: 0 2px;
      }

      .result-body h3 {
        font-size: 13px;
        font-weight: 600;
        color: #2d3561;
        margin: 10px 0 4px;
      }

      .result-body h3:first-child {
        margin-top: 0;
      }

      .result-body ul, .result-body ol {
        padding-left: 18px;
        margin: 4px 0;
      }

      .result-body li {
        margin: 2px 0;
      }

      .result-body p {
        margin: 6px 0;
      }

      .result-body p:first-child {
        margin-top: 0;
      }

      .result-body p:last-child {
        margin-bottom: 0;
      }

      .result-body blockquote {
        margin: 6px 0;
        padding: 4px 10px;
        border-left: 3px solid #6c5ce7;
        background: #f8f7ff;
        border-radius: 0 4px 4px 0;
        color: #4a4d5e;
      }

      .result-body code {
        background: #f0f0f4;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 12px;
        font-family: "SF Mono", Menlo, monospace;
      }

      .loading {
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
        padding: 24px 0;
        color: #8b8fa3;
        font-size: 13px;
      }

      .dots span {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #6c5ce7;
        animation: ai-wa-bounce 1.2s infinite ease-in-out;
      }

      .dots span:nth-child(2) { animation-delay: .2s; }
      .dots span:nth-child(3) { animation-delay: .4s; }

      @keyframes ai-wa-bounce {
        0%, 80%, 100% { transform: scale(.5); opacity: .3; }
        40% { transform: scale(1); opacity: 1; }
      }
    </style>

    <div id="content"></div>
  `;

  document.body.appendChild(host);
  return { host, shadow, content: shadow.getElementById("content") };
}

let panelState = null;

function removePanel() {
  if (!panelState) return;
  panelState.host.remove();
  panelState = null;
}

function showToolbar(rect) {
  removePanel();
  panelState = createPanel();
  const { content } = panelState;

  content.innerHTML = `
    <div class="toolbar">
      <button data-action="explain"><span class="icon">💡</span>解释</button>
      <button data-action="translate"><span class="icon">🌐</span>翻译</button>
      <button data-action="summarize"><span class="icon">📄</span>总结页面</button>
    </div>
  `;

  content.querySelector(".toolbar").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    handleAction(btn.dataset.action);
  });

  positionPanel(rect, 44);
}

function showResult(title, text, isError) {
  if (!panelState) return;
  const { content } = panelState;

  const bodyHtml = isError ? escapeHtml(text) : sanitizeHtml(text);

  content.innerHTML = `
    <div class="result-panel">
      <div class="result-header">
        <span class="title">${escapeHtml(title)}</span>
        <button class="close-btn" title="Close">✕</button>
      </div>
      <div class="result-body${isError ? " error" : ""}">${bodyHtml}</div>
    </div>
  `;

  content.querySelector(".close-btn").addEventListener("click", () => removePanel());

  // reposition near last selection
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    positionPanel(rect, 380);
  }
}

function showLoading(title) {
  if (!panelState) return;
  const { content } = panelState;

  content.innerHTML = `
    <div class="result-panel">
      <div class="result-header">
        <span class="title">${escapeHtml(title)}</span>
        <button class="close-btn" title="Close">✕</button>
      </div>
      <div class="result-body">
        <div class="loading">
          <div class="dots"><span></span><span></span><span></span></div>
          AI 思考中...
        </div>
      </div>
    </div>
  `;

  content.querySelector(".close-btn").addEventListener("click", () => removePanel());

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    positionPanel(rect, 380);
  }
}

function positionPanel(rect, estimatedHeight) {
  if (!panelState) return;
  const { host } = panelState;

  let top = rect.top + window.scrollY - estimatedHeight - 10;
  let left = rect.left + window.scrollX + rect.width / 2 - 180;

  // If would go above viewport, show below selection instead
  if (top < window.scrollY) {
    top = rect.bottom + window.scrollY + 8;
  }

  // Clamp horizontal
  left = Math.max(8, Math.min(left, window.innerWidth - 380));

  host.style.top = top + "px";
  host.style.left = left + "px";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Allowlist-based HTML sanitizer — strips dangerous tags/attrs, keeps formatting.
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "mark", "p", "br", "ul", "ol", "li", "h3", "h4", "blockquote", "code", "span"]);
const ALLOWED_ATTRS = new Set(["style"]);

function sanitizeHtml(raw) {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const walk = (node) => {
    const remove = [];
    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
          remove.push(child);
        } else {
          // Strip disallowed attributes
          for (const attr of [...child.attributes]) {
            if (!ALLOWED_ATTRS.has(attr.name)) child.removeAttribute(attr.name);
          }
          walk(child);
        }
      }
    }
    remove.forEach((el) => el.replaceWith(...el.childNodes));
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

// ── AI actions ──

async function callAI(systemPrompt, userMessage) {
  const response = await chrome.runtime.sendMessage({
    type: "AI_REQUEST",
    payload: { systemPrompt, userMessage },
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unknown error");
  }

  return response.result;
}

async function handleAction(action) {
  const context = getPageContext();

  let systemPrompt = "";
  let userMessage = "";
  let title = "";

  if (action === "explain") {
    title = "💡 解释";
    systemPrompt =
      "你是阅读辅助助手。请用中文解释用户选中的文本，说明其含义和上下文中的作用。使用 HTML 格式输出，可以用 <b> 加粗关键词，<mark> 高亮重点，<p> 分段，<ul><li> 列举要点。不要输出 markdown 语法。简洁明了。";
    userMessage = `选中文本：${context.selectedText}\n\n所在网页标题：${context.title}\n\n请解释这段文本。`;
  } else if (action === "translate") {
    title = "🌐 翻译";
    systemPrompt =
      "你是翻译助手。请将用户选中的文本翻译成中文。如果已经是中文，则翻译成英文。只输出翻译结果，不要添加解释。使用 HTML 格式，可以用 <b> 加粗关键术语。不要输出 markdown。";
    userMessage = `请翻译：${context.selectedText}`;
  } else if (action === "summarize") {
    title = "📄 总结页面";
    systemPrompt =
      "你是网页内容总结助手。请用中文输出：核心结论、关键要点、值得注意的细节。使用 HTML 格式：<h3> 作为小标题，<b> 加粗关键词，<mark> 高亮重点，<ul><li> 列举要点。不要输出 markdown 语法。保持简洁，不要重复原文。";
    userMessage = `网页标题：${context.title}\n网页 URL：${context.url}\n\n网页正文：\n${context.pageText}`;
  }

  showLoading(title);

  try {
    const result = await callAI(systemPrompt, userMessage);
    showResult(title, result, false);
  } catch (error) {
    showResult(title, error.message, true);
  }
}

// ── Selection detection ──

let isMouseDown = false;

document.addEventListener("mousedown", (e) => {
  isMouseDown = true;

  // Don't remove panel if clicking inside it
  if (panelState && panelState.host.contains(e.target)) return;

  removePanel();
});

document.addEventListener("mouseup", (e) => {
  if (!isMouseDown) return;
  isMouseDown = false;

  // Ignore clicks inside the panel
  if (panelState && panelState.host.contains(e.target)) return;

  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();

    if (!text || text.length < 2) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) return;

    showToolbar(rect);
  }, 10);
});

// Also respond to popup-triggered messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse(getPageContext());
  }
});
