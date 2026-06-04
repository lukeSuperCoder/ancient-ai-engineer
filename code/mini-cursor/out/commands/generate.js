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
exports.registerGenerateCommand = registerGenerateCommand;
const vscode = __importStar(require("vscode"));
const builder_1 = require("../context/builder");
const prompts_1 = require("../ai/prompts");
const client_1 = require("../ai/client");
function registerGenerateCommand(context, sidebar) {
    const disposable = vscode.commands.registerCommand("miniCursor.generate", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor.");
            return;
        }
        const instruction = await vscode.window.showInputBox({
            prompt: "What code would you like to generate?",
            placeHolder: "e.g. A debounce function in TypeScript",
        });
        if (!instruction) {
            return;
        }
        const codeContext = (0, builder_1.buildCodeContext)(editor, instruction);
        const { systemPrompt, userMessage } = (0, prompts_1.buildGeneratePrompt)(codeContext);
        sidebar.show();
        sidebar.postMessage({ type: "loading", title: "Generate Code" });
        try {
            const raw = await (0, client_1.callAI)(systemPrompt, userMessage);
            const code = (0, client_1.stripCodeFence)(raw);
            sidebar.postMessage({
                type: "generate",
                title: "Generate Code",
                code,
            });
            const position = editor.selection.active;
            sidebar.setAction({
                apply: () => {
                    editor.edit((editBuilder) => {
                        editBuilder.insert(position, code);
                    });
                    sidebar.clearAction();
                    sidebar.postMessage({ type: "welcome" });
                    vscode.window.showInformationMessage("Code inserted.");
                },
                cancel: () => {
                    sidebar.clearAction();
                    sidebar.postMessage({ type: "welcome" });
                },
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            sidebar.postMessage({ type: "error", title: "Generate Code", message: msg });
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=generate.js.map