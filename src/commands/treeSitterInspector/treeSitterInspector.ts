import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as strings from "@/utils/templating/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as parser from "@/utils/templating/parser";
import * as decor from "@/utils/vscode/decor";
import type Parser from "tree-sitter";
import inspectorHtml from "./inspector.html";

/**
 * treeSitterInspector: Create a tree-sitter inspector command with a webview panel that decorates all tokens, shows token info on hover, and has an input box for validating and highlighting tree-sitter queries in real-time.
 */
const commandName = "treeSitterInspector";
const languages = undefined;
const repoName = undefined;

let currentPanel: vscode.WebviewPanel | undefined;
let tokenDecorationType: vscode.TextEditorDecorationType;
let queryDecorationType: vscode.TextEditorDecorationType;
let hoverProvider: vscode.Disposable | undefined;

const commandFunc = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active text editor found.");
    return;
  }

  const document = editor.document;
  const tree = parser.getParseTree(document);

  if (!tree) {
    vscode.window.showErrorMessage(
      `Tree-sitter not supported for language: ${document.languageId}`
    );
    return;
  }

  const language = parser.getLanguage(document.languageId);
  if (!language) {
    vscode.window.showErrorMessage(
      `Could not get language module for: ${document.languageId}`
    );
    return;
  }

  if (tokenDecorationType) {
    editor.setDecorations(tokenDecorationType, []);
    tokenDecorationType.dispose();
  }
  if (queryDecorationType) {
    editor.setDecorations(queryDecorationType, []);
    queryDecorationType.dispose();
  }
  if (hoverProvider) {
    hoverProvider.dispose();
  }

  tokenDecorationType = decor.tokenDecor();

  queryDecorationType = decor.highlightDecor();

  const allNodes: Parser.SyntaxNode[] = [];
  const collectNodes = (node: Parser.SyntaxNode) => {
    if (node.childCount === 0) {
      allNodes.push(node);
    }
    for (let i = 0; i < node.childCount; i++) {
      collectNodes(node.child(i)!);
    }
  };
  collectNodes(tree.rootNode);

  const tokenRanges = allNodes.map((node) => {
    const startPos = document.positionAt(node.startIndex);
    const endPos = document.positionAt(node.endIndex);
    return new vscode.Range(startPos, endPos);
  });
  editor.setDecorations(tokenDecorationType, tokenRanges);


  hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", language: document.languageId },
    {
      provideHover(
        doc: vscode.TextDocument,
        position: vscode.Position
      ): vscode.Hover | undefined {
        if (doc.uri.toString() !== document.uri.toString()) {
          return undefined;
        }

        const offset = doc.offsetAt(position);
        const node = tree.rootNode.descendantForIndex(offset, offset);

        if (!node) {
          return undefined;
        }

        const text = doc.getText(
          new vscode.Range(
            doc.positionAt(node.startIndex),
            doc.positionAt(node.endIndex)
          )
        );

        const parent = node.parent;
        const parentType = parent ? parent.type : "none";

        let fieldName = "none";
        if (parent) {
          for (let i = 0; i < parent.childCount; i++) {
            if (parent.child(i) === node) {
              fieldName = parent.fieldNameForChild(i) || "none";
              break;
            }
          }
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(`Type: ${node.type}`, "");
        markdown.appendCodeblock(`Parent: ${parentType}`, "");
        markdown.appendCodeblock(`Field: ${fieldName || "none"}`, "");
        markdown.appendCodeblock(
          `Text: ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`,
          ""
        );

        return new vscode.Hover(markdown);
      },
    }
  );

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      "treeSitterInspector",
      "Tree-sitter Inspector",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
      if (tokenDecorationType) {
        editor.setDecorations(tokenDecorationType, []);
        tokenDecorationType.dispose();
      }
      if (queryDecorationType) {
        editor.setDecorations(queryDecorationType, []);
        queryDecorationType.dispose();
      }
      if (hoverProvider) {
        hoverProvider.dispose();
      }
    });

    currentPanel.webview.html = inspectorHtml;
  }

  currentPanel.webview.onDidReceiveMessage((message) => {
    switch (message.command) {
      case "query":
        const queryString = message.query;
        const validation = parser.validateQuery(queryString, language);
        if (!queryString || !validation.valid) {
          if (queryDecorationType) {
            editor.setDecorations(queryDecorationType, []);
          }
          currentPanel?.webview.postMessage({
            command: "queryResult",
            matchCount: 0,
            error: validation.error,
          });
          return;
        }

        const matches = parser.executeQuery(tree, queryString, language);
        const matchRanges: vscode.Range[] = [];

        for (const match of matches) {
          for (const capture of match.captures) {
            const startPos = document.positionAt(capture.node.startIndex);
            const endPos = document.positionAt(capture.node.endIndex);
            matchRanges.push(new vscode.Range(startPos, endPos));
          }
        }

        if (queryDecorationType) {
          editor.setDecorations(tokenDecorationType, []);
          editor.setDecorations(queryDecorationType, matchRanges);
        }

        currentPanel?.webview.postMessage({
          command: "queryResult",
          matchCount: matchRanges.length,
          error: null,
        });
        break;
    }
  }, undefined);
};

const mcpFunc = mcp.executeCommand(
  commandName,
  (args: any) => "Command treeSitterInspector executed"
);

const description =
  "Create a tree-sitter inspector command with a webview panel that decorates all tokens, shows token info on hover, and has an input box for validating and highlighting tree-sitter queries in real-time.";
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
  inputSchema,
  mcpFunc
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
