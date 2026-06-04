import * as vscode from "vscode";
import { buildCodeContext } from "../context/builder";
import { buildRefactorPrompt } from "../ai/prompts";
import { callAI, parseRefactorResult, stripCodeFence } from "../ai/client";
import { MiniCursorSidebar } from "../ui/sidebar";

function simpleDiff(oldCode: string, newCode: string): string {
  const oLines = oldCode.split("\n");
  const nLines = newCode.split("\n");
  const maxLen = Math.max(oLines.length, nLines.length);
  const lines: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const o = oLines[i];
    const n = nLines[i];
    if (o === undefined) {
      lines.push(`<span style="color:#27ae60">+ ${n}</span>`);
    } else if (n === undefined) {
      lines.push(`<span style="color:#e74c3c">- ${o}</span>`);
    } else if (o !== n) {
      lines.push(`<span style="color:#e74c3c">- ${o}</span>`);
      lines.push(`<span style="color:#27ae60">+ ${n}</span>`);
    } else {
      lines.push(`  ${o}`);
    }
  }
  return lines.join("\n");
}

export function registerRefactorCommand(
  context: vscode.ExtensionContext,
  sidebar: MiniCursorSidebar
) {
  const disposable = vscode.commands.registerCommand(
    "miniCursor.refactor",
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
        prompt: "Enter refactor instruction",
        placeHolder: "e.g. Extract the repeated logic into a helper function",
      });

      if (instruction === undefined) {
        return;
      }

      const codeContext = buildCodeContext(editor, instruction);
      const { systemPrompt, userMessage } = buildRefactorPrompt(codeContext);

      const oldCode = codeContext.selectedCode;

      sidebar.show();
      sidebar.postMessage({ type: "loading", title: "Refactor Code" });

      try {
        const raw = await callAI(systemPrompt, userMessage);
        const result = parseRefactorResult(raw);
        const newCode = stripCodeFence(result.newCode);
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
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sidebar.postMessage({ type: "error", title: "Refactor Code", message: msg });
      }
    }
  );

  context.subscriptions.push(disposable);
}
