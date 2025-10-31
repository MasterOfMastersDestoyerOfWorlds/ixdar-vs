import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";
import * as parser from "@/utils/parser";
import * as decor from "@/utils/decor";
import type Parser from "tree-sitter";

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

  // Clean up existing decorations and hover provider
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

  // Create decoration types
  tokenDecorationType = decor.tokenDecor();

  queryDecorationType = decor.highlightDecor();

  // Walk the tree and collect all nodes
  const allNodes: Parser.SyntaxNode[] = [];
  const collectNodes = (node: Parser.SyntaxNode) => {
    if (node.childCount === 0) {
      // Leaf node (actual token)
      allNodes.push(node);
    }
    for (let i = 0; i < node.childCount; i++) {
      collectNodes(node.child(i)!);
    }
  };
  collectNodes(tree.rootNode);

  // Create decorations for all tokens
  const tokenRanges = allNodes.map((node) => {
    const startPos = document.positionAt(node.startIndex);
    const endPos = document.positionAt(node.endIndex);
    return new vscode.Range(startPos, endPos);
  });
  editor.setDecorations(tokenDecorationType, tokenRanges);

  // Register hover provider to show token info
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

        // Find field name by iterating through parent's children
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

  // Create or show webview panel
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

    currentPanel.webview.html = getWebviewContent();
  }

  // Handle messages from webview
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

        // Execute query
        const matches = parser.executeQuery(tree, queryString, language);
        const matchRanges: vscode.Range[] = [];

        for (const match of matches) {
          for (const capture of match.captures) {
            const startPos = document.positionAt(capture.node.startIndex);
            const endPos = document.positionAt(capture.node.endIndex);
            matchRanges.push(new vscode.Range(startPos, endPos));
          }
        }

        // Highlight query matches
        if (queryDecorationType) {
          editor.setDecorations(tokenDecorationType, []);
          editor.setDecorations(queryDecorationType, matchRanges);
        }

        // Send results back to webview
        currentPanel?.webview.postMessage({
          command: "queryResult",
          matchCount: matchRanges.length,
          error: null,
        });
        break;
    }
  }, undefined);
};

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tree-sitter Inspector</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 20px;
    }
    .section {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    input[type="text"] {
      width: 100%;
      padding: 8px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
    }
    input[type="text"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .status {
      margin-top: 10px;
      padding: 10px;
      border-radius: 4px;
    }
    .status.success {
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-editor-background);
    }
    .status.error {
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
    }
    .help {
      margin-top: 20px;
      padding: 15px;
      background-color: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textBlockQuote-border);
    }
    .help h3 {
      margin-top: 0;
      font-size: 1.1em;
    }
    code {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 2px;
      font-family: var(--vscode-editor-font-family);
    }
    pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>🌳 Tree-sitter Inspector</h1>
  
  <div class="section">
    <p><strong>All tokens are highlighted.</strong> Hover over any token in the editor to see its tree-sitter type.</p>
  </div>

  <div class="section">
    <label for="queryInput">Tree-sitter Query:</label>
    <input 
      type="text" 
      id="queryInput" 
      placeholder="(function_declaration name: (identifier) @name)"
    />
    <div id="status"></div>
  </div>

  <div class="help">
    <h3>📖 Query Examples</h3>
    <ul>
      <li><code>(function_declaration)</code> - All function declarations</li>
      <li><code>(identifier) @name</code> - All identifiers with capture</li>
      <li><code>(function_declaration name: (identifier) @func_name)</code> - Function names</li>
      <li><code>(call_expression function: (identifier) @fn)</code> - Function calls</li>
      <li><code>[(string) (number)] @literal</code> - Strings or numbers</li>
    </ul>
    <p><strong>Tip:</strong> Query matches will be highlighted with a bright border in the editor.</p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const queryInput = document.getElementById('queryInput');
    const statusDiv = document.getElementById('status');

    let debounceTimer;

    queryInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = queryInput.value;
        vscode.postMessage({
          command: 'query',
          query: query
        });
      }, 300);
    });

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'queryResult':
          if (message.error) {
            statusDiv.className = 'status error';
            statusDiv.textContent = \`❌ Error: \${message.error}\`;
          } else if (message.matchCount > 0) {
            statusDiv.className = 'status success';
            statusDiv.textContent = \`✓ Found \${message.matchCount} match\${message.matchCount !== 1 ? 'es' : ''}\`;
          } else {
            statusDiv.className = 'status';
            statusDiv.textContent = '';
          }
          break;
      }
    });
  </script>
</body>
</html>`;
}

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
  mcpFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
