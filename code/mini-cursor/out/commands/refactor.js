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
exports.registerRefactorCommand = registerRefactorCommand;
const vscode = __importStar(require("vscode"));
const builder_1 = require("../context/builder");
const prompts_1 = require("../ai/prompts");
const client_1 = require("../ai/client");
function simpleDiff(oldCode, newCode) {
    const oLines = oldCode.split("\n");
    const nLines = newCode.split("\n");
    const maxLen = Math.max(oLines.length, nLines.length);
    const lines = [];
    for (let i = 0; i < maxLen; i++) {
        const o = oLines[i];
        const n = nLines[i];
        if (o === undefined) {
            lines.push(`<span style="color:#27ae60">+ ${n}</span>`);
        }
        else if (n === undefined) {
            lines.push(`<span style="color:#e74c3c">- ${o}</span>`);
        }
        else if (o !== n) {
            lines.push(`<span style="color:#e74c3c">- ${o}</span>`);
            lines.push(`<span style="color:#27ae60">+ ${n}</span>`);
        }
        else {
            lines.push(`  ${o}`);
        }
    }
    return lines.join("\n");
}
function registerRefactorCommand(context, sidebar) {
    const disposable = vscode.commands.registerCommand("miniCursor.refactor", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor.");
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage("Please select code first.");
            return;
        }
        const instruction = await vscode.window.showInputBox({
            prompt: "Enter refactor instruction",
            placeHolder: "e.g. Extract the repeated logic into a helper function",
        });
        if (instruction === undefined) {
            return;
        }
        const codeContext = (0, builder_1.buildCodeContext)(editor, instruction);
        const { systemPrompt, userMessage } = (0, prompts_1.buildRefactorPrompt)(codeContext);
        const oldCode = codeContext.selectedCode;
        sidebar.show();
        sidebar.postMessage({ type: "loading", title: "Refactor Code" });
        try {
            const raw = await (0, client_1.callAI)(systemPrompt, userMessage);
            const result = (0, client_1.parseRefactorResult)(raw);
            const newCode = (0, client_1.stripCodeFence)(result.newCode);
            const diff = simpleDiff(oldCode, newCode);
            sidebar.postMessage({
                type: "refactor",
                title: "Refactor Code",
                summary: result.summary,
                diff,
                oldCode,
                newCode,
                notes: result.notes || [],
            });
            sidebar.setAction({
                apply: () => {
                    editor.edit((editBuilder) => {
                        editBuilder.replace(selection, newCode);
                    });
                    sidebar.clearAction();
                    sidebar.postMessage({ type: "welcome" });
                    vscode.window.showInformationMessage("Refactor applied.");
                },
                cancel: () => {
                    sidebar.clearAction();
                    sidebar.postMessage({ type: "welcome" });
                },
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            sidebar.postMessage({ type: "error", title: "Refactor Code", message: msg });
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=refactor.js.map