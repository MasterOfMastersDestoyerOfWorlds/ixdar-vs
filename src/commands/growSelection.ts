import * as vscode from "vscode";
import * as commandModule from "@/types/command/commandModule";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as parser from "@/utils/templating/parser";
import * as inputs from "@/utils/vscode/userInputs";
import { CommandPipeline } from "@/types/command/commandModule";

/**
 *  @ix-description growSelection: Grows the current selection to the containing tree-sitter node
 */
const languages = undefined;
const repoName = undefined;

const pipeline: CommandPipeline = {
  execute: async () => {
    const editor = inputs.getActiveEditor();
    const document = editor.document;
    const tree = parser.getParseTree(document);
    const selection = editor.selection;
    const startOffset = document.offsetAt(selection.start);
    const endOffset = document.offsetAt(selection.end);

    const startNode = tree.rootNode.descendantForIndex(
      startOffset,
      startOffset
    );
    const endNode = tree.rootNode.descendantForIndex(endOffset, endOffset);

    if (!startNode || !endNode) {
      return { changed: false };
    }

    const lca = parser.findLCA(startNode, endNode, tree);
    const alreadyAtLCA =
      lca.startIndex === startOffset && lca.endIndex === endOffset;
    const targetNode = alreadyAtLCA && lca.parent ? lca.parent : lca;

    if (targetNode === lca && alreadyAtLCA && !lca.parent) {
      return { changed: false };
    }

    const newSelection = new vscode.Selection(
      document.positionAt(targetNode.startIndex),
      document.positionAt(targetNode.endIndex)
    );

    editor.selection = newSelection;
    editor.revealRange(
      newSelection,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );

    return {
      changed: true,
      start: {
        line: newSelection.start.line,
        character: newSelection.start.character,
      },
      end: {
        line: newSelection.end.line,
        character: newSelection.end.character,
      },
    };
  }
};

const command: commandModule.CommandModule =
  new commandModule.CommandModuleImpl({
    repoName,
    ixModule: __ix_module,
    languages,
    pipeline,
  });

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
