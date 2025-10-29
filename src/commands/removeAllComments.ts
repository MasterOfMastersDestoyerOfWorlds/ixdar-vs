import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import * as parser from "@/utils/parser";
import Parser from "tree-sitter";
import { RegisterCommand } from "@/utils/commandRegistry";

/**
 * removeAllComments: Remove all single-line comments from the current file using tree-sitter AST parsing.
 */
const commandName = "removeAllComments";
const languages = [
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
  "java",
  "csharp",
  "python",
];
const repoName = undefined;

export const commandFunc = async (parseTree?: Parser.Tree) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const document = editor.document;
  const languageId = document.languageId;

  const tree = parseTree || parser.getParseTree(document);
  const language = parser.getLanguage(languageId);
  if (!language) {
    vscode.window.showErrorMessage("Failed to get parser for language.");
    return;
  }
  if (!tree) {
    vscode.window.showErrorMessage("Failed to parse document.");
    return;
  }

  const lineCommentKeyword = parser.getLineCommentKeyword(languageId);
  const commentSymbol = parser.getCommentSymbol(languageId);

  const query = new Parser.Query(language, `(${lineCommentKeyword}) @c`);

  const matches = query.matches(tree.rootNode);

  const nodesToRemove = matches
    .map((match: { captures: { node: any }[] }) => match.captures[0].node)
    .filter(
      (node: Parser.SyntaxNode) =>
        node.type === lineCommentKeyword && node.text.startsWith(commentSymbol)
    );


  await editor.edit((editBuilder) => {
    for (const node of nodesToRemove) {
      const nodeText = node.text;
      const prevSibling = node.previousSibling;
      const isFullLine =
        prevSibling === null ||
        node.startPosition.row > prevSibling.endPosition.row;
      if (isFullLine) {
        editBuilder.delete(
          document.lineAt(node.startPosition.row).rangeIncludingLineBreak
        );
      } else {
        const range = new vscode.Range(
          new vscode.Position(
            node.startPosition.row,
            node.startPosition.column
          ),
          new vscode.Position(node.endPosition.row, node.endPosition.column)
        );
        editBuilder.delete(range);
      }
    }
  });

  vscode.window.showInformationMessage(`Removed all single-line comments.`);
};

const mcpFunc = mcp.executeCommand(
  commandName,
  () => "Removed all single-line comments from the active file."
);

const description =
  "Remove all single-line comments from the current file (// or # based on language). Does not remove block comments.";
const inputSchema = {
  type: "object",
  properties: {},
};

const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  mcpFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
