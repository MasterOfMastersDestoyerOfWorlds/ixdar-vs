import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as strings from "../utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import { runWithAvailabilityGuard } from "../utils/command/availability";
import type Parser from "tree-sitter";
import { RegisterUtil } from "@/utils/utilRegistry";

export interface InputSchema {
  type: string;
  properties?: { [key: string]: { type: string; description: string } };
  required?: string[];
}
export interface McpToolDefinition {
  description: string;
  inputSchema: InputSchema;
}

export class McpResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface CommandAvailabilityMeta {
  category: "general" | "repo";
  allowedRepoNames?: string[];
  languages?: string[];
}

export interface CommandModule {
  name: string;
  description: string;
  meta: CommandAvailabilityMeta;
  vscodeCommand: {
    id: string;
    register: (context: ExtensionContext) => void;
  };
  mcp: {
    enabled: boolean;
    tool: McpToolDefinition;
    call: (args: any) => Promise<McpResult> | undefined;
  };
}

export class CommandModuleImpl implements CommandModule {
  public meta: CommandAvailabilityMeta;
  public name: string;
  public description: string;
  public vscodeCommand: {
    id: string;
    register: (context: ExtensionContext) => void;
  };
  public mcp: {
    enabled: boolean;
    tool: McpToolDefinition;
    call: (args: any) => Promise<McpResult> | undefined;
  };

  /**
   * A constructor for creating an object that implements CommandModule.
   */
  constructor(
    repoName: string | undefined,
    commandName: string,
    languages: string[] | undefined,
    commandFunc: (parseTree?: Parser.Tree) => Promise<void> | void,
    description: string,
    inputSchema: InputSchema,
    mcpFunc?: (args: any) => Promise<McpResult>
  ) {
    this.name = commandName;
    this.description = description;
    this.meta = {
      category: repoName ? "repo" : "general",
      allowedRepoNames: repoName ? [repoName] : [],
      languages: languages ?? undefined,
    };
    const vscodeId: string = importer.extensionCommandName(commandName);
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
              () => commandFunc()
            );
          }
        );
        context.subscriptions.push(disposable);
      },
    };
    this.mcp = {
      enabled: mcpFunc !== undefined,
      tool: {
        description: description,
        inputSchema: inputSchema,
      },
      call: mcpFunc || (async () => ({ 
        content: [{ type: "text", text: "MCP not enabled for this command" }],
        isError: true 
      })),
    };
  }
  static isValidRequest(args: any, inputSchema: InputSchema): {valid: boolean, errors: string[]} {
    for (const property in inputSchema.properties) {
      if (!args[property]) {
        return {valid: false, errors: [`Property ${property} is required`]};
      }
    }
    return {valid: true, errors: []};
  }
}

// Register all exports with the UtilRegistry
@RegisterUtil("@/types/command", [
  { name: "InputSchema", kind: "interface" },
  { name: "McpToolDefinition", kind: "interface" },
  { name: "McpResult", kind: "class" },
  { name: "CommandAvailabilityMeta", kind: "interface" },
  { name: "CommandModule", kind: "interface" },
  { name: "CommandModuleImpl", kind: "class" },
])
class CommandTypesRegistry {
  static registered = true;
}
