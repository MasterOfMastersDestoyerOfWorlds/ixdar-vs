
import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule } from "@/types/command";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as parser from "@/utils/templating/parser";
import type Parser from "tree-sitter";
import * as inputs from "@/utils/vscode/input";

/**
 * growSelection: Grows the current selection to the containing tree-sitter node
 */
const commandName = "growSelection";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const editor = inputs.getActiveEditor();  
  const document = editor.document;
  const tree = parser.getParseTree(document);
  const selection = editor.selection;
  const startOffset = document.offsetAt(selection.start);
  const endOffset = document.offsetAt(selection.end);
  
  const startNode = tree.rootNode.descendantForIndex(startOffset, startOffset);
  const endNode = tree.rootNode.descendantForIndex(endOffset, endOffset);
  
  if (!startNode || !endNode) {
    return;
  }
  
  const lca = parser.findLCA(startNode, endNode, tree);
  
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
