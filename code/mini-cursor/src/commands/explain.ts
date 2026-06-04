import * as vscode from "vscode";
import { buildCodeContext } from "../context/builder";
import { buildExplainPrompt } from "../ai/prompts";
import { callAI } from "../ai/client";
import { MiniCursorSidebar } from "../ui/sidebar";

export function registerExplainCommand(
  context: vscode.ExtensionContext,
  sidebar: MiniCursorSidebar
) {
  const disposable = vscode.commands.registerCommand(
    "miniCursor.explain",
    async () => {
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

      const codeContext = buildCodeContext(editor);
      const { systemPrompt, userMessage } = buildExplainPrompt(codeContext);

      sidebar.show();
      sidebar.postMessage({ type: "loading", title: "Explain Code" });

      try {
        const result = await callAI(systemPrompt, userMessage);
        sidebar.postMessage({
          type: "explain",
          title: "Explain Code",
          content: result,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sidebar.postMessage({ type: "error", title: "Explain Code", message: msg });
      }
    }
  );

  context.subscriptions.push(disposable);
}
