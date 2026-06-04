import * as vscode from "vscode";

export interface CodeContext {
  fileName: string;
  language: string;
  selectedCode: string;
  surroundingCode: string;
  fullFileContent?: string;
  selectionRange?: vscode.Range;
  cursorPosition?: vscode.Position;
  instruction?: string;
}

export function getLanguageId(editor: vscode.TextEditor): string {
  const langMap: Record<string, string> = {
    javascript: "javascript",
    typescript: "typescript",
    python: "python",
    java: "java",
    csharp: "csharp",
    cpp: "cpp",
    go: "go",
    rust: "rust",
    ruby: "ruby",
    php: "php",
    html: "html",
    css: "css",
    json: "json",
    yaml: "yaml",
    markdown: "markdown",
    sql: "sql",
    shellscript: "bash",
  };
  const id = editor.document.languageId;
  return langMap[id] || id;
}

export function getSurroundingContext(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  linePadding = 20
): string {
  const startLine = Math.max(0, selection.start.line - linePadding);
  const endLine = Math.min(document.lineCount - 1, selection.end.line + linePadding);

  const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
  return document.getText(range);
}

export function buildCodeContext(
  editor: vscode.TextEditor,
  instruction?: string
): CodeContext {
  const document = editor.document;
  const selection = editor.selection;
  const selectedCode = document.getText(selection);
  const fileName = document.uri.path.split("/").pop() || "untitled";
  const language = getLanguageId(editor);

  const isEmpty = selection.isEmpty;
  const surroundingCode = getSurroundingContext(
    document,
    isEmpty
      ? new vscode.Selection(selection.active, selection.active)
      : selection,
    20
  );

  return {
    fileName,
    language,
    selectedCode,
    surroundingCode,
    fullFileContent: document.getText(),
    selectionRange: selection,
    cursorPosition: selection.active,
    instruction,
  };
}
