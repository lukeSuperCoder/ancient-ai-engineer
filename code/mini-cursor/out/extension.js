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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sidebar_1 = require("./ui/sidebar");
const explain_1 = require("./commands/explain");
const refactor_1 = require("./commands/refactor");
const generate_1 = require("./commands/generate");
const inlineEdit_1 = require("./commands/inlineEdit");
function activate(context) {
    const sidebar = new sidebar_1.MiniCursorSidebar(context.extensionUri);
    // Register sidebar view provider
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebar_1.MiniCursorSidebar.viewType, sidebar, { webviewOptions: { retainContextWhenHidden: true } }));
    // Register commands
    (0, explain_1.registerExplainCommand)(context, sidebar);
    (0, refactor_1.registerRefactorCommand)(context, sidebar);
    (0, generate_1.registerGenerateCommand)(context, sidebar);
    (0, inlineEdit_1.registerInlineEditCommand)(context, sidebar);
    // Open settings command
    context.subscriptions.push(vscode.commands.registerCommand("miniCursor.openSettings", () => {
        vscode.commands.executeCommand("workbench.action.openSettings", "miniCursor");
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map