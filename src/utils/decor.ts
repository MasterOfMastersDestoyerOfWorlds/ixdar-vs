import * as vscode from "vscode";

export function highlightDecor() {
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor(
      "editor.findMatchHighlightBackground"
    ),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
  });
}
