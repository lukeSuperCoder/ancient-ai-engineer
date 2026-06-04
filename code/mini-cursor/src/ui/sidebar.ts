import * as vscode from "vscode";

// Message types between extension host and webview
export type WebviewMessage =
  | { type: "apply" }
  | { type: "cancel" }
  | { type: "copy" };

export type ExtensionMessage =
  | { type: "loading"; title: string }
  | { type: "explain"; title: string; content: string }
  | { type: "refactor"; title: string; summary: string; diff: string; oldCode: string; newCode: string; notes: string[] }
  | { type: "generate"; title: string; code: string }
  | { type: "inlineEdit"; title: string; oldCode: string; newCode: string }
  | { type: "error"; title: string; message: string }
  | { type: "welcome" };

export interface SidebarAction {
  apply?(): void;
  cancel?(): void;
}

export class MiniCursorSidebar implements vscode.WebviewViewProvider {
  public static readonly viewType = "miniCursor.sidebar";

  private _view?: vscode.WebviewView;
  private _pendingAction?: SidebarAction;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      switch (msg.type) {
        case "apply":
          this._pendingAction?.apply?.();
          this._pendingAction = undefined;
          break;
        case "cancel":
          this._pendingAction?.cancel?.();
          this._pendingAction = undefined;
          break;
        case "copy":
          break;
      }
    });
  }

  public show() {
    this._view?.show?.(true);
  }

  public postMessage(message: ExtensionMessage) {
    this._view?.webview.postMessage(message);
  }

  public setAction(action: SidebarAction) {
    this._pendingAction = action;
  }

  public clearAction() {
    this._pendingAction = undefined;
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mini Cursor</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --accent: #6c5ce7;
      --accent-hover: #5b4cc4;
      --border: var(--vscode-panel-border, rgba(255,255,255,.08));
      --error: #e74c3c;
      --success: #27ae60;
      --muted: var(--vscode-descriptionForeground, #8b8fa3);
      --card: var(--vscode-editorWidget-background, #1e1e2e);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--fg);
      background: var(--bg);
      padding: 12px;
    }
    h2 {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .welcome {
      text-align: center;
      padding: 24px 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.8;
    }
    .welcome kbd {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 11px;
      font-family: var(--vscode-editor-font-family);
    }
    .loading {
      text-align: center;
      padding: 32px 0;
      color: var(--muted);
    }
    .dots {
      display: inline-flex;
      gap: 5px;
      margin-bottom: 10px;
    }
    .dots span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--accent);
      animation: bounce 1.2s infinite ease-in-out;
    }
    .dots span:nth-child(2) { animation-delay: .2s; }
    .dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(.5); opacity: .3; }
      40% { transform: scale(1); opacity: 1; }
    }
    .content {
      line-height: 1.7;
      word-break: break-word;
    }
    .content h3 {
      font-size: 12px;
      font-weight: 600;
      margin: 10px 0 4px;
    }
    .content h3:first-child { margin-top: 0; }
    .content p { margin: 6px 0; }
    .content ul, .content ol {
      padding-left: 18px;
      margin: 4px 0;
    }
    .content li { margin: 2px 0; }
    .content code {
      background: var(--card);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
    }
    .content pre {
      background: var(--card);
      border-radius: 6px;
      padding: 10px;
      margin: 8px 0;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
    }
    .content pre code {
      background: none;
      padding: 0;
    }
    .content blockquote {
      border-left: 3px solid var(--accent);
      background: var(--card);
      padding: 6px 10px;
      margin: 6px 0;
      border-radius: 0 4px 4px 0;
    }
    .summary {
      background: var(--card);
      border-radius: 6px;
      padding: 8px 10px;
      margin: 8px 0;
      font-size: 12px;
      color: var(--fg);
    }
    .notes {
      padding-left: 16px;
      margin: 6px 0;
      font-size: 12px;
      color: var(--muted);
    }
    .notes li { margin: 2px 0; }
    .diff-block {
      background: var(--card);
      border-radius: 6px;
      padding: 8px 10px;
      margin: 8px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.6;
      overflow-x: auto;
      white-space: pre;
    }
    .diff-add { color: var(--success); }
    .diff-del { color: var(--error); }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      flex: 1;
      padding: 7px 12px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
    }
    .btn-primary {
      background: var(--accent);
      color: #fff;
    }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: var(--card);
      color: var(--fg);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { opacity: .85; }
    .btn-copy {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
      flex: 0;
      padding: 7px 10px;
    }
    .btn-copy:hover { color: var(--fg); }
    .error-msg {
      color: var(--error);
      background: rgba(231,76,60,.08);
      border-radius: 6px;
      padding: 10px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const app = document.getElementById("app");

    function escapeHtml(s) {
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }

    function renderMarkdown(md) {
      // Very lightweight: code blocks, inline code, bold, headers, lists, blockquotes
      let html = escapeHtml(md);
      // Code blocks
      html = html.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\\n?\`\`\`/g, "<pre><code>$2</code></pre>");
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, "<code>$1</code>");
      // Bold
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
      // Headers
      html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
      html = html.replace(/^# (.+)$/gm, "<h3>$1</h3>");
      // Blockquote
      html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
      // Lists
      html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
      html = html.replace(/(<li>.*<\\/li>\\n?)+/g, (m) => "<ul>" + m + "</ul>");
      // Paragraphs
      html = html.replace(/\\n{2,}/g, "</p><p>");
      html = "<p>" + html + "</p>";
      html = html.replace(/<p>\\s*<\\/p>/g, "");
      return html;
    }

    function renderDiff(oldC, newC) {
      const oLines = oldC.split("\\n");
      const nLines = newC.split("\\n");
      const maxLen = Math.max(oLines.length, nLines.length);
      let html = "";
      for (let i = 0; i < maxLen; i++) {
        const o = oLines[i];
        const n = nLines[i];
        if (o === undefined) {
          html += '<span class="diff-add">+ ' + escapeHtml(n) + '</span>\\n';
        } else if (n === undefined) {
          html += '<span class="diff-del">- ' + escapeHtml(o) + '</span>\\n';
        } else if (o !== n) {
          html += '<span class="diff-del">- ' + escapeHtml(o) + '</span>\\n';
          html += '<span class="diff-add">+ ' + escapeHtml(n) + '</span>\\n';
        } else {
          html += '  ' + escapeHtml(o) + '\\n';
        }
      }
      return html;
    }

    function renderWelcome() {
      app.innerHTML = \`
        <div class="welcome">
          <h2>Mini Cursor</h2>
          <p>AI 代码助手 — 选中代码后使用命令或快捷键</p>
          <p style="margin-top:12px; text-align:left;">
            <kbd>Cmd+Shift+E</kbd> Explain<br/>
            <kbd>Cmd+Shift+R</kbd> Refactor<br/>
            <kbd>Cmd+Shift+G</kbd> Generate<br/>
            <kbd>Cmd+Shift+I</kbd> Inline Edit
          </p>
          <p style="margin-top:12px;">运行 <code>Mini Cursor: Open Settings</code> 配置 API Key</p>
        </div>
      \`;
    }

    function renderLoading(title) {
      app.innerHTML = \`
        <h2>\${escapeHtml(title)}</h2>
        <div class="loading">
          <div class="dots"><span></span><span></span><span></span></div>
          <div>AI 思考中...</div>
        </div>
      \`;
    }

    function renderError(title, message) {
      app.innerHTML = \`
        <h2>\${escapeHtml(title)}</h2>
        <div class="error-msg">\${escapeHtml(message)}</div>
      \`;
    }

    function renderExplain(title, content) {
      app.innerHTML = \`
        <h2>\${escapeHtml(title)}</h2>
        <div class="content">\${renderMarkdown(content)}</div>
        <div class="actions">
          <button class="btn-copy" onclick="copyToClipboard(this)" data-text="\${escapeHtml(content)}">Copy</button>
        </div>
      \`;
    }

    function renderRefactor(title, summary, diff, oldCode, newCode, notes) {
      const notesHtml = notes && notes.length
        ? "<ul class=\\"notes\\">" + notes.map(n => "<li>" + escapeHtml(n) + "</li>").join("") + "</ul>"
        : "";
      app.innerHTML = \`
        <h2>\${escapeHtml(title)}</h2>
        <div class="summary">\${escapeHtml(summary)}</div>
        \${notesHtml}
        <h3>Changes</h3>
        <div class="diff-block">\${diff}</div>
        <div class="actions">
          <button class="btn-primary" onclick="postMsg('apply')">Apply</button>
          <button class="btn-secondary" onclick="postMsg('cancel')">Cancel</button>
        </div>
      \`;
    }

    function renderGenerate(title, code) {
      app.innerHTML = \`
        <h2>\${escapeHtml(title)}</h2>
        <pre><code>\${escapeHtml(code)}</code></pre>
        <div class="actions">
          <button class="btn-primary" onclick="postMsg('apply')">Insert</button>
          <button class="btn-copy" onclick="copyToClipboard(this)" data-text="\${escapeHtml(code)}">Copy</button>
          <button class="btn-secondary" onclick="postMsg('cancel')">Cancel</button>
        </div>
      \`;
    }

    function renderInlineEdit(title, oldCode, newCode) {
      const diff = renderDiff(oldCode, newCode);
      app.innerHTML = \`
        <h2>\${escapeHtml(title)}</h2>
        <h3>Changes</h3>
        <div class="diff-block">\${diff}</div>
        <div class="actions">
          <button class="btn-primary" onclick="postMsg('apply')">Apply</button>
          <button class="btn-secondary" onclick="postMsg('cancel')">Cancel</button>
        </div>
      \`;
    }

    function postMsg(type) {
      window.parent.postMessage({ type }, "*");
    }

    // Since we're in a webview, use the acquireVsCodeApi pattern
    const vscode = acquireVsCodeApi();
    const origPostMsg = postMsg;
    postMsg = function(type) {
      vscode.postMessage({ type });
    };

    function copyToClipboard(btn) {
      const text = btn.getAttribute("data-text");
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1500);
      });
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case "welcome": renderWelcome(); break;
        case "loading": renderLoading(msg.title); break;
        case "explain": renderExplain(msg.title, msg.content); break;
        case "refactor": renderRefactor(msg.title, msg.summary, msg.diff, msg.oldCode, msg.newCode, msg.notes); break;
        case "generate": renderGenerate(msg.title, msg.code); break;
        case "inlineEdit": renderInlineEdit(msg.title, msg.oldCode, msg.newCode); break;
        case "error": renderError(msg.title, msg.message); break;
      }
    });

    renderWelcome();
  </script>
</body>
</html>`;
  }
}
