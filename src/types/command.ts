import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as strings from "../utils/strings";
import { runWithAvailabilityGuard } from "../utils/availability";
import type Parser from "tree-sitter";
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface McpResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface CommandAvailabilityMeta {
  category: "general" | "repo";
  allowedRepoNames?: string[];
  languages?: string[];
}

export interface CommandModule {
  meta: CommandAvailabilityMeta;
  vscodeCommand: {
    id: string;
    register: (context: ExtensionContext) => void;
  };
  mcp: {
    tool: McpToolDefinition;
    call: (args: any) => Promise<McpResult>;
  };
}

export class CommandModuleImpl implements CommandModule {
  public meta: CommandAvailabilityMeta;
  public vscodeCommand: {
    id: string;
    register: (context: ExtensionContext) => void;
  };
  public mcp: {
    tool: McpToolDefinition;
    call: (args: any) => Promise<McpResult>;
  };

  /**
   * A constructor for creating an object that implements CommandModule.
   */
  constructor(
    repoName: string | undefined,
    commandName: string,
    languages: string[] | undefined,
    commandFunc: (parseTree?: Parser.Tree) => Promise<void> | void,
	mcpFunc: (args: any) => Promise<McpResult>,
    description: string,
    inputSchema: any
  ) {
    this.meta = {
      category: repoName ? "repo" : "general",
      allowedRepoNames: repoName ? [repoName] : [],
      languages: languages ?? undefined,
    };
    const vscodeId: string = strings.extensionName() + "." + commandName;
    this.vscodeCommand = {
      id: vscodeId,
      register: (context: vscode.ExtensionContext) => {
        const disposable = vscode.commands.registerCommand(
          vscodeId,
          async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
              return;
            }
            await runWithAvailabilityGuard(
              this.meta,
              editor.document.uri,
              (msg) => vscode.window.showWarningMessage(msg),
              () => commandFunc() // Call without parse tree by default, commands can get it themselves
            );
          }
        );
        context.subscriptions.push(disposable);
      },
    };
    this.mcp = {
      tool: {
        name: strings.toSnakeCase(commandName),
        description: description,
        inputSchema: inputSchema,
      },
      call: mcpFunc,
    };
  }
}
