import * as vscode from "vscode";
import * as commandModule from "@/types/command/commandModule";
import * as parser from "@/utils/templating/parser";
import Parser from "tree-sitter";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as inputs from "@/utils/vscode/userInputs";
import { CommandPipeline } from "@/types/command/commandModule";

/**
 *  @ix-description removeAllComments: Remove all single-line comments from the current file using tree-sitter AST parsing.
 */
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

async function removeSingleLineComments(
  editor: vscode.TextEditor,
  parseTree?: Parser.Tree
): Promise<number> {
  const document = editor.document;
  const languageId = document.languageId;

  const tree = parseTree || (await parser.getParseTree(document));
  const language = parser.getLanguage(languageId);

  const lineCommentKeyword = parser.getLineCommentKeyword(languageId);
  const commentSymbol = parser.getCommentSymbol(languageId);

  const query = new Parser.Query(language, `(${lineCommentKeyword}) @c`);
  const matches = query.matches(tree.rootNode);

  const nodesToRemove = matches
    .map(
      (match: { captures: { node: Parser.SyntaxNode }[] }) =>
        match.captures[0].node
    )
    .filter(
      (node) =>
        node.type === lineCommentKeyword && node.text.startsWith(commentSymbol)
    );

  if (nodesToRemove.length === 0) {
    return 0;
  }

  await editor.edit((editBuilder) => {
    for (const node of nodesToRemove) {
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

  return nodesToRemove.length;
}

const pipeline: CommandPipeline = {
  execute: async () => {
    const editor = inputs.getActiveEditor();
    const removed = await removeSingleLineComments(editor);
    return {
      removedComments: removed,
    };
  },
  cleanup: async (context, _inputs, result, _error) => {
    if (!result) {
      return;
    }

    if (result.removedComments === 0) {
      context.addWarning("No single-line comments found.");
      return;
    }

    context.addMessage(
      `Removed ${result.removedComments} single-line comment(s).`
    );
  },
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
