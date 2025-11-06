
import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import * as strings from "@/utils/templating/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as parser from "@/utils/templating/parser";
import type Parser from "tree-sitter";

/**
 * growSelection: Grows the current selection to the containing tree-sitter node
 */
const commandName = "growSelection";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  
  const document = editor.document;
  const tree = parser.getParseTree(document);
  if (!tree) {
    vscode.window.showErrorMessage("Tree-sitter not supported for this language");
    return;
  }
  
  const selection = editor.selection;
  const startOffset = document.offsetAt(selection.start);
  const endOffset = document.offsetAt(selection.end);
  
  const startNode = tree.rootNode.descendantForIndex(startOffset, startOffset);
  const endNode = tree.rootNode.descendantForIndex(endOffset, endOffset);
  
  if (!startNode || !endNode) {
    return;
  }
  
  const findLCA = (node1: Parser.SyntaxNode, node2: Parser.SyntaxNode): Parser.SyntaxNode => {
    let current: Parser.SyntaxNode | null = node1;
    while (current) {
      if (current.startIndex <= node2.startIndex && current.endIndex >= node2.endIndex) {
        return current;
      }
      current = current.parent;
    }
    return tree.rootNode;
  };
  
  const lca = findLCA(startNode, endNode);
  
  const alreadyAtLCA = lca.startIndex === startOffset && lca.endIndex === endOffset;
  const targetNode = (alreadyAtLCA && lca.parent) ? lca.parent : lca;
  
  if (targetNode === lca && alreadyAtLCA && !lca.parent) {
    return;
  }
  
  const newSelection = new vscode.Selection(
    document.positionAt(targetNode.startIndex),
    document.positionAt(targetNode.endIndex)
  );
  
  editor.selection = newSelection;
  editor.revealRange(newSelection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
};

const description = "Grows the current selection to the containing tree-sitter node";
const inputSchema = {
  type: "object",
  properties: {},
};

const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
