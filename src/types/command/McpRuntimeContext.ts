import {
  CommandRuntimeContext,
  CommandMode,
  InputSchema,
  McpResult,
  CommandModuleImpl,
} from "@/types/command/commandModule";
import { CommandInputPlan } from "./CommandInputPlan";
import { formatUnknownError, safeStringify } from "@/utils/templating/strings";
/**
 * @ix-module-description MCP runtime context implementation for commands. Provides message display 
 * (info/warning/error), file collection, and input resolution for commands running in MCP.
 */
export class McpRuntimeContext<TInputs extends Record<string, any>>
  implements CommandRuntimeContext
{
  public readonly mode: CommandMode = "mcp";
  public readonly args: Record<string, unknown>;
  private readonly commandModule: CommandModuleImpl<TInputs, any>;
  private schema: InputSchema = {
    type: "object",
    properties: {},
    required: [],
  };
  private messages: string[] = [];
  private warnings: string[] = [];
  private errors: string[] = [];
  private files: Array<{ path: string; label?: string }> = [];

  constructor(
    commandModule: CommandModuleImpl<TInputs, any>,
    args: Record<string, unknown>
  ) {
    this.commandModule = commandModule;
    this.args = args ?? {};
  }

  addMessage(message: string): void {
    this.messages.push(message);
  }

  addWarning(message: string): void {
    this.warnings.push(message);
  }

  addError(message: string): void {
    this.errors.push(message);
  }

  async collectFile(path: string, label?: string): Promise<void> {
    this.files.push({ path, label });
  }

  toResult(result: unknown): McpResult {
    return this.buildResult({ success: true, result });
  }

  toErrorResult(error: unknown): McpResult {
    return this.buildResult({
      success: false,
      error: formatUnknownError(error),
    });
  }

  private buildResult(payload: {
    success: boolean;
    result?: unknown;
    error?: string;
  }): McpResult {
    const output = {
      ...payload,
      messages: this.messages,
      warnings: this.warnings,
      errors: this.errors,
      files: this.files,
      schema: this.schema,
    };

    return {
      content: [
        {
          type: "text",
          text: safeStringify(output),
        },
      ],
      isError: !payload.success,
    };
  }

  public async execute(args: Record<string, unknown>): Promise<McpResult> {
    try {
      const inputs = await this.resolveInputs(this, this.commandModule.plan);
      const result = await this.commandModule.runPipeline(this, inputs);
      return this.toResult(result);
    } catch (error) {
      this.addError(formatUnknownError(error));
      return this.toErrorResult(error);
    }
  }

  private async resolveInputs(
    context: McpRuntimeContext<TInputs>,
    plan?: CommandInputPlan<TInputs>
  ): Promise<TInputs> {
    const values: Partial<TInputs> = {};

    for (const step of plan?.allSteps ?? []) {
      let value: unknown;

      if (step.resolveFromArgs) {
        value = await step.resolveFromArgs(
          { mode: "mcp", args: context.args },
          values
        );
      } else if (Object.prototype.hasOwnProperty.call(context.args, step.key)) {
        value = context.args[step.key];
      } else if (step.defaultValue !== undefined) {
        value = step.defaultValue;
      } else if (step.required) {
        throw new Error(`Missing required argument '${step.key}'.`);
      }

      (values as Record<string, unknown>)[step.key] = value as unknown;
    }

    return values as TInputs;
  }
}
