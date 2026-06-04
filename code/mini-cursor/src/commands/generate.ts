import * as vscode from "vscode";
import { buildCodeContext } from "../context/builder";
import { buildGeneratePrompt } from "../ai/prompts";
import { callAI, stripCodeFence } from "../ai/client";
import { MiniCursorSidebar } from "../ui/sidebar";

export function registerGenerateCommand(
  context: vscode.ExtensionContext,
  sidebar: MiniCursorSidebar
) {
  const disposable = vscode.commands.registerCommand(
    "miniCursor.generate",
    async () => {
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

      const codeContext = buildCodeContext(editor, instruction);
      const { systemPrompt, userMessage } = buildGeneratePrompt(codeContext);

      sidebar.show();
      sidebar.postMessage({ type: "loading", title: "Generate Code" });

      try {
        const raw = await callAI(systemPrompt, userMessage);
        const code = stripCodeFence(raw);

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
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sidebar.postMessage({ type: "error", title: "Generate Code", message: msg });
      }
    }
  );

  context.subscriptions.push(disposable);
}
