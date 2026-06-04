import * as vscode from "vscode";
import { buildCodeContext } from "../context/builder";
import { buildInlineEditPrompt } from "../ai/prompts";
import { callAI, stripCodeFence } from "../ai/client";
import { MiniCursorSidebar } from "../ui/sidebar";

export function registerInlineEditCommand(
  context: vscode.ExtensionContext,
  sidebar: MiniCursorSidebar
) {
  const disposable = vscode.commands.registerCommand(
    "miniCursor.inlineEdit",
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

      const instruction = await vscode.window.showInputBox({
        prompt: "How should the selected code be modified?",
        placeHolder: "e.g. Add error handling, rename variable, fix the bug",
      });

      if (!instruction) {
        return;
      }

      const codeContext = buildCodeContext(editor, instruction);
      const { systemPrompt, userMessage } = buildInlineEditPrompt(codeContext);

      const oldCode = codeContext.selectedCode;

      sidebar.show();
      sidebar.postMessage({ type: "loading", title: "Inline Edit" });

      try {
        const raw = await callAI(systemPrompt, userMessage);
        const newCode = stripCodeFence(raw);

        if (!newCode.trim()) {
          sidebar.postMessage({
            type: "error",
            title: "Inline Edit",
            message: "AI returned empty result.",
          });
          return;
        }

        sidebar.postMessage({
          type: "inlineEdit",
          title: "Inline Edit",
          oldCode,
          newCode,
        });

        sidebar.setAction({
          apply: () => {
            editor.edit((editBuilder) => {
              editBuilder.replace(selection, newCode);
            });
            sidebar.clearAction();
            sidebar.postMessage({ type: "welcome" });
            vscode.window.showInformationMessage("Edit applied.");
          },
          cancel: () => {
            sidebar.clearAction();
            sidebar.postMessage({ type: "welcome" });
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sidebar.postMessage({ type: "error", title: "Inline Edit", message: msg });
      }
    }
  );

  context.subscriptions.push(disposable);
}
