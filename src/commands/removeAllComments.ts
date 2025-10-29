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

  const text = document.getText();

  const isSlashCommentLang = [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
    "java",
    "csharp",
  ].includes(languageId);
  const isHashCommentLang = ["python"].includes(languageId);

  const cursor = tree.walk();

  const query = new Parser.Query(language, `(comment) @c`);

  // 3. Find all matches in the tree
  const matches = query.matches(tree.rootNode);

  // 4. Filter the matches to find only single-line (//) comments
  const nodesToRemove = matches
    .map((match: { captures: { node: any }[] }) => match.captures[0].node) // Get the actual node from each match
    .filter((node: { text: string }) => node.text.startsWith("//")); // Keep only nodes that are single-line comments

  function isFullLineComment(node: any) {
    // Get the node that comes immediately before this one *at the same level*.
    const prevSibling = node.previousSibling;

    // Case 1: No previous sibling.
    // If it's the first child of its parent (e.g., first line in file,
    // or first line in a method block), it's a full-line comment.
    if (prevSibling === null) {
      return true;
    }

    // Case 2: It has a previous sibling.
    // We compare the line where the sibling *ends*
    // with the line where this node *starts*.
    const prevEndRow = prevSibling.endPosition.row;
    const thisStartRow = node.startPosition.row;

    // If this node starts on a *later* line, it's a full-line comment.
    // If it starts on the *same* line, it's an inline comment.
    return thisStartRow > prevEndRow;
  }

  // 7. Rebuild the string by slicing and skipping the nodes to remove
  let newText = "";
  let lastIndex = 0;

  for (const node of nodesToRemove) {
    // We just pass the node itself now
    const isFullLine = isFullLineComment(node);

    // Add the text from the end of the last removed node
    // up to the start of this one.
    const slice = text.slice(lastIndex, node.startIndex);
    // Always trim trailing whitespace. For inline comments, this removes
    // space before the comment. For full-line, it removes indentation.
    newText += slice.trimEnd();

    // Skip this node by moving the index past it
    lastIndex = node.endIndex;

    // --- THIS IS THE FIX ---
    // Only skip the newline if it's a full-line comment
    if (isFullLine) {
      if (lastIndex < text.length) {
        if (text[lastIndex] === "\r") {
          lastIndex++; // Skip carriage return
        }
        if (lastIndex < text.length && text[lastIndex] === "\n") {
          lastIndex++; // Skip newline
        }
      }
    }
  }

  // 6. Add any remaining text from the end of the last
  // removed node to the end of the file.
  newText += text.slice(lastIndex);

  await editor.edit((editBuilder) => {
    const firstLine = document.lineAt(0);
    const lastLine = document.lineAt(document.lineCount - 1);
    const fullRange = new vscode.Range(
      firstLine.range.start,
      lastLine.range.end
    );
    editBuilder.replace(fullRange, newText);
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

export default command;
