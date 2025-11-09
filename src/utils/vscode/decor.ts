import * as vscode from "vscode";

/**
 * @description Use this module to create decorations for the VS Code editor.
 */

/**
 * Create a decoration type for highlighting matches.
 * @returns A decoration type for highlighting matches.
 */
export function highlightDecor() {
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor(
      "editor.findMatchHighlightBackground"
    ),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
  });
}

/**
 * Create a decoration type for token highlighting.
 * @returns A decoration type for token highlighting.
 */
export function tokenDecor(): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
    border: "1px dotted",
    borderColor: new vscode.ThemeColor("editorBracketMatch.border"),
  });
}

/**
 * Clear decorations.
 * @param editor The editor to clear the decorations from.
 * @param matchDecorationType The decoration type to clear.
 */
export function clearDecorations(editor: vscode.TextEditor, matchDecorationType: vscode.TextEditorDecorationType) {
  editor.setDecorations(matchDecorationType, []);
  matchDecorationType.dispose();
}
