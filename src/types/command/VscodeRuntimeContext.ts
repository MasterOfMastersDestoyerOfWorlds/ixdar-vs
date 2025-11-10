import { formatUnknownError } from "@/utils/templating/strings";
import * as vscode from "vscode";
import {
  CommandRuntimeContext,
  CommandMode,
  McpResult,
  CommandInputContext,
  CommandModuleImpl,
} from "@/types/command/commandModule";
import { CommandInputPlan } from "./CommandInputPlan";
import * as mcp from "@/utils/ai/mcp";

export class VscodeRuntimeContext<TInputs extends Record<string, any>> implements CommandRuntimeContext {
  private readonly commandModule: CommandModuleImpl<TInputs, any>;
  public readonly mode: CommandMode = "vscode";
  public readonly args: Record<string, unknown> = {};

  addMessage(message: string): void {
    void vscode.window.showInformationMessage(message);
  }

  addWarning(message: string): void {
    void vscode.window.showWarningMessage(message);
  }

  addError(message: string): void {
    void vscode.window.showErrorMessage(message);
  }

  constructor(commandModule: CommandModuleImpl<TInputs, any>) {
    this.commandModule = commandModule;
  }

  async collectFile(path: string, label?: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(path);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: false });
      if (label) {
        this.addMessage(label);
      }
    } catch (error) {
      this.addWarning(
        `Unable to open file ${path}: ${formatUnknownError(error)}`
      );
    }
  }

  public async execute(args: Record<string, unknown>): Promise<McpResult> {

    try {
      const inputs = await this.resolveInputs(this.commandModule.plan);
      await this.commandModule.runPipeline(this, inputs);
    } catch (error) {
      this.addError(formatUnknownError(error));
    }
    return mcp.returnMcpSuccess("Command executed successfully");
  }
  private async resolveInputs(
    plan: CommandInputPlan<TInputs>
  ): Promise<TInputs> {
    const context: CommandInputContext = { mode: "vscode" };
    const values: Partial<TInputs> = {};

    for (const step of plan.allSteps) {
      const value = await step.prompt(context, values);
      (values as Record<string, unknown>)[step.key] = value as unknown;
    }

    return values as TInputs;
  }
}
