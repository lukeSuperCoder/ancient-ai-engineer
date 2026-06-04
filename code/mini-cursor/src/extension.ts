import * as vscode from "vscode";
import { MiniCursorSidebar } from "./ui/sidebar";
import { registerExplainCommand } from "./commands/explain";
import { registerRefactorCommand } from "./commands/refactor";
import { registerGenerateCommand } from "./commands/generate";
import { registerInlineEditCommand } from "./commands/inlineEdit";

export function activate(context: vscode.ExtensionContext) {
  const sidebar = new MiniCursorSidebar(context.extensionUri);

  // Register sidebar view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MiniCursorSidebar.viewType,
      sidebar,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Register commands
  registerExplainCommand(context, sidebar);
  registerRefactorCommand(context, sidebar);
  registerGenerateCommand(context, sidebar);
  registerInlineEditCommand(context, sidebar);

  // Open settings command
  context.subscriptions.push(
    vscode.commands.registerCommand("miniCursor.openSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "miniCursor"
      );
    })
  );
}

export function deactivate() {}
