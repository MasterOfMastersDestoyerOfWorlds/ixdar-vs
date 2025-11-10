import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as importer from "@/utils/templating/importer";
import { runWithAvailabilityGuard } from "@/utils/command/availability";
import { RegisterUtilModule } from "@/utils/utilRegistry";
import { McpRuntimeContext } from "@/types/command/McpRuntimeContext";
import { VscodeRuntimeContext } from "@/types/command/VscodeRuntimeContext";
import { CommandInputPlan } from "./CommandInputPlan";

/**
 * Command execution modes.
 */
export type CommandMode = "vscode" | "mcp";

/**
 * JSON schema definition for a single input property.
 */
export interface InputSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: Array<string | number | boolean>;
  items?: InputSchemaProperty;
  format?: string;
}

/**
 * JSON schema definition for command inputs.
 */
export interface InputSchema {
  type: "object";
  properties: Record<string, InputSchemaProperty>;
  required: string[];
}

export interface McpToolDefinition {
  description: string;
  inputSchema: InputSchema;
}

export class McpResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Context available while gathering VS Code inputs.
 * Additional services can be added over time.
 */
export interface VscodeInputContext {
  mode: "vscode";
}

/**
 * Context available while resolving MCP inputs.
 */
export interface McpInputContext {
  mode: "mcp";
  args: Record<string, unknown>;
}

export type CommandInputContext = VscodeInputContext | McpInputContext;

/**
 * Context provided to command and cleanup functions.
 */
export interface CommandRuntimeContext {
  mode: CommandMode;
  args: Record<string, unknown>;
  addMessage(message: string): void;
  addWarning(message: string): void;
  addError(message: string): void;
  collectFile?(path: string, label?: string): Promise<void>;
  execute(args: Record<string, unknown>): Promise<McpResult>;
}

export type CommandInputFunc<TInputs extends Record<string, any>> = () =>
  | CommandInputPlan<TInputs>;

export type CommandExecuteFunc<TInputs extends Record<string, any>, TResult> = (
  context: CommandRuntimeContext,
  inputs: TInputs
) => Promise<TResult>;

export type CommandCleanupFunc<TInputs extends Record<string, any>, TResult> = (
  context: CommandRuntimeContext,
  inputs: TInputs,
  result: TResult | undefined,
  error?: unknown
) => Promise<void>;

export interface CommandPipeline<TInputs extends Record<string, any>, TResult> {
  input: CommandInputFunc<TInputs>;
  execute: CommandExecuteFunc<TInputs, TResult>;
  cleanup?: CommandCleanupFunc<TInputs, TResult>;
}

export interface CommandAvailabilityMeta {
  category: "general" | "repo";
  allowedRepoNames?: string[];
  languages?: string[];
}

export interface CommandModule<
  TInputs extends Record<string, any> = any,
  TResult = any,
> {
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
  pipeline: CommandPipeline<TInputs, TResult>;
}

export interface CommandModuleOptions<
  TInputs extends Record<string, any>,
  TResult,
> {
  repoName?: string;
  commandName: string;
  languages?: string[];
  description: string;
  pipeline: CommandPipeline<TInputs, TResult>;
}

export class CommandModuleImpl<TInputs extends Record<string, any>, TResult>
  implements CommandModule<TInputs, TResult>
{
  public readonly meta: CommandAvailabilityMeta;
  public readonly name: string;
  public readonly description: string;
  public readonly pipeline: CommandPipeline<TInputs, TResult>;
  public readonly vscodeCommand: {
    id: string;
    register: (context: ExtensionContext) => void;
  };
  public readonly mcp: {
    enabled: boolean;
    tool: McpToolDefinition;
    call: (args: any) => Promise<McpResult> | undefined;
  };
  runtimeContext: CommandRuntimeContext;
  plan: CommandInputPlan<TInputs>;

  constructor(options: CommandModuleOptions<TInputs, TResult>) {
    this.runtimeContext = new VscodeRuntimeContext(this);
    this.name = options.commandName;
    this.description = options.description;
    this.pipeline = options.pipeline;
    this.meta = {
      category: options.repoName ? "repo" : "general",
      allowedRepoNames: options.repoName ? [options.repoName] : [],
      languages: options.languages ?? undefined,
    };

    const vscodeId = importer.extensionCommandName(options.commandName);
    this.plan = this.pipeline.input();
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
              async () => {
                await this.runtimeContext.execute({});
              }
            );
          }
        );
        context.subscriptions.push(disposable);
      },
    };

    this.mcp = {
      enabled: true,
      tool: {
        description: options.description,
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      call: async (args: Record<string, unknown>) => {
        return this.runtimeContext.execute(args ?? {});
      },
    };
  }


  public async runPipeline(
    context: CommandRuntimeContext,
    inputs: TInputs
  ): Promise<TResult | undefined> {
    let result: TResult | undefined;
    let failure: unknown;

    try {
      result = await this.pipeline.execute(context, inputs);
    } catch (error) {
      failure = error;
    }

    if (this.pipeline.cleanup) {
      try {
        await this.pipeline.cleanup(context, inputs, result, failure);
      } catch (cleanupError) {
        if (!failure) {
          failure = cleanupError;
        }
      }
    }

    if (failure) {
      throw failure;
    }

    return result;
  }

}

@RegisterUtilModule("command", "@/types/command")
class CommandTypesModule {}
