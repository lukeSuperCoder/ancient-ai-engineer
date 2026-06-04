"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanguageId = getLanguageId;
exports.getSurroundingContext = getSurroundingContext;
exports.buildCodeContext = buildCodeContext;
const vscode = __importStar(require("vscode"));
function getLanguageId(editor) {
    const langMap = {
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
function getSurroundingContext(document, selection, linePadding = 20) {
    const startLine = Math.max(0, selection.start.line - linePadding);
    const endLine = Math.min(document.lineCount - 1, selection.end.line + linePadding);
    const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
    return document.getText(range);
}
function buildCodeContext(editor, instruction) {
    const document = editor.document;
    const selection = editor.selection;
    const selectedCode = document.getText(selection);
    const fileName = document.uri.path.split("/").pop() || "untitled";
    const language = getLanguageId(editor);
    const isEmpty = selection.isEmpty;
    const surroundingCode = getSurroundingContext(document, isEmpty
        ? new vscode.Selection(selection.active, selection.active)
        : selection, 20);
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
//# sourceMappingURL=builder.js.map