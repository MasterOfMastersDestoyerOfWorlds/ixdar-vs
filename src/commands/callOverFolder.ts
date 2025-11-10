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

interface InputValues {
  folderUri: vscode.Uri;
  commandId: string;
}

interface CommandResult {
  totalFiles: number;
  successCount: number;
  errorCount: number;
  errors: string[];
  cancelled: boolean;
}

const pipeline: commandModule.CommandPipeline<InputValues, CommandResult> = {
  input: () =>
    CommandInputPlan.createInputPlan<InputValues>((builder) => {
      builder.step({
        key: "folderUri",
        schema: {
          type: "string",
          description: "Absolute path to the folder to process",
        },
        prompt: async () => {
          const folderSelection = await userInputs.selectFolder();

          return folderSelection[0];
        },
        resolveFromArgs: async ({ args }) => {
          const folderPath = args.folderPath;
          if (typeof folderPath !== "string" || folderPath.length === 0) {
            throw new Error("Property 'folderPath' is required.");
          }
          const folderUri = vscode.Uri.file(folderPath);
          try {
            await vscode.workspace.fs.stat(folderUri);
          } catch {
            throw new Error(`Folder not found: ${folderPath}`);
          }
          return folderUri;
        },
      });

      builder.step({
        key: "commandId",
        schema: {
          type: "string",
          description:
            "Name or ID of the command to execute on each file (e.g. 'removeAllComments' or 'editor.action.formatDocument')",
        },
        prompt: async () => {
          const allCommands =
            await commandRegistry.getAllCommandQuickPickItems();
          const selected = await userInputs.selectCommandQuickPickItem(allCommands);
          return selected.commandModule.vscodeCommand.id;
        },
        resolveFromArgs: async ({ args }) => {
          const targetCommandName =
            (typeof args.commandName === "string" && args.commandName) ||
            (typeof args.commandId === "string" && args.commandId);
          if (!targetCommandName) {
            throw new Error("Property 'commandName' is required.");
          }

          const registry = commandRegistry.CommandRegistry.getInstance();
          const allCommands = registry.getAllMcpCommands();

          const targetCommand = allCommands.find(
            (cmd) =>
              cmd.vscodeCommand.id === targetCommandName ||
              cmd.vscodeCommand.id.endsWith(`.${targetCommandName}`) ||
              cmd.name === targetCommandName
          );

          if (targetCommand) {
            return targetCommand.vscodeCommand.id;
          }

          const vscodeCommands = await vscode.commands.getCommands(true);
          if (!vscodeCommands.includes(targetCommandName)) {
            throw new Error(`Command not found: ${targetCommandName}`);
          }
          return targetCommandName;
        },
      });
    }),
  execute: async (_context, inputs) => {
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

            await vscode.commands.executeCommand(inputs.commandId);

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
  cleanup: async (context, _inputs, result, error) => {
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
      result.errors.slice(0, 5).forEach((message) => context.addError(message));
    }

    context.addMessage(
      `Completed: ${result.successCount} successful, ${result.errorCount} errors`
    );
  },
};

const description =
  "Call any ix command or vscode command over all files and sub folders of a given folder";

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl<
  InputValues,
  CommandResult
>({
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


