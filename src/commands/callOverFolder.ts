import * as vscode from "vscode";
import * as path from "path";
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as fs from "@/utils/vscode/fs";
import * as userInputs from "@/utils/vscode/userInputs";

/**
 * callOverFolder: Call any ix command or vscode command over all files and sub folders of a given folder
 */
const commandName = "callOverFolder";
const languages = undefined;
const repoName = undefined;

interface CommandResult {
  totalFiles: number;
  successCount: number;
  errorCount: number;
  errors: string[];
  cancelled: boolean;
}

const pipeline = {
  input: () =>
    CommandInputPlan.createInputPlan()
      .step(userInputs.folderInput())
      .step(userInputs.commandInput())
      .build(),
  execute: async (
    _context: commandModule.CommandRuntimeContext,
    inputs: { folderUri: vscode.Uri; commandId: commandModule.CommandModule }
  ) => {
    const files = await fs.getAllFiles(inputs.folderUri);

    if (files.length === 0) {
      return {
        totalFiles: 0,
        successCount: 0,
        errorCount: 0,
        errors: [],
        cancelled: false,
      };
    }

    let successCount = 0;
    let errorCount = 0;
    let cancelled = false;
    const errors: string[] = [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Executing ${inputs.commandId}`,
        cancellable: true,
      },
      async (progress, token) => {
        for (let index = 0; index < files.length; index++) {
          if (token.isCancellationRequested) {
            cancelled = true;
            break;
          }

          const file = files[index];
          progress.report({
            message: `Processing file ${index + 1}/${files.length}: ${path.basename(
              file.fsPath
            )}`,
            increment: 100 / files.length,
          });

          try {
            const document = await vscode.workspace.openTextDocument(file);
            await vscode.window.showTextDocument(document, {
              preview: false,
              preserveFocus: true,
            });

            await commandRegistry.executeCommand(inputs.commandId);

            if (document.isDirty) {
              await document.save();
            }

            successCount++;
          } catch (error: any) {
            errorCount++;
            errors.push(`${file.fsPath}: ${error?.message ?? "Unknown error"}`);
          }
        }
      }
    );

    return {
      totalFiles: files.length,
      successCount,
      errorCount,
      errors,
      cancelled,
    };
  },
  cleanup: async (
    context: commandModule.CommandRuntimeContext,
    _inputs: { folderUri: vscode.Uri; commandId: commandModule.CommandModule },
    result: CommandResult | undefined,
    error?: unknown
  ) => {
    if (error || !result) {
      return;
    }

    if (result.totalFiles === 0) {
      context.addWarning("No files found in the selected folder.");
      return;
    }

    if (result.cancelled) {
      context.addWarning(
        `Operation cancelled after processing ${result.successCount + result.errorCount}/${result.totalFiles} files.`
      );
    }

    if (result.errors.length > 0) {
      result.errors.slice(0, 5).forEach((message: string) => context.addError(message));
    }

    context.addMessage(
      `Completed: ${result.successCount} successful, ${result.errorCount} errors`
    );
  },
};

const description =
  "Call any ix command or vscode command over all files and sub folders of a given folder";

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl({
  repoName,
  commandName,
  languages,
  description,
  pipeline,
});

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;


