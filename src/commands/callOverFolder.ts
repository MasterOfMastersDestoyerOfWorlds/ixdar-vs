import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as mcp from "@/utils/ai/mcp";
import {
  RegisterCommand,
  CommandRegistry,
} from "@/utils/command/commandRegistry";
import * as path from "path";
import * as fs from "@/utils/vscode/fs";
/**
 * callOverFolder: Call any ix command or vscode command over all files and sub folders of a given folder
 */
const commandName = "callOverFolder";
const languages = undefined;
const repoName = undefined;

const commandFunc = async () => {
  const folderUri = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select Folder",
    title: "Select folder to process",
  });

  if (!folderUri || folderUri.length === 0) {
    vscode.window.showErrorMessage("No folder selected.");
    return;
  }

  const selectedFolder = folderUri[0];

  // Step 2: Select command to execute
  const registry = CommandRegistry.getInstance();
  const allCommands = registry.getAllMcpCommands();

  // Also get all VS Code commands
  const vscodeCommands = await vscode.commands.getCommands(true);

  interface CommandQuickPickItem extends vscode.QuickPickItem {
    commandId: string;
    isIxdar: boolean;
  }

  // Add ixdar commands
  const ixdarItems: CommandQuickPickItem[] = allCommands
    .filter((cmd) => cmd.name !== commandName) // Don't allow recursive calls
    .map((cmd) => ({
      label: `$(symbol-method) ${cmd.name}`,
      description: cmd.description,
      detail: `Ixdar Command | ${cmd.meta.category}`,
      commandId: cmd.vscodeCommand.id,
      isIxdar: true,
    }));

  // Add common VS Code commands
  const commonVSCodeCommands = vscodeCommands
    .filter(
      (cmd) =>
        cmd.startsWith("editor.action.") ||
        cmd.startsWith("workbench.action.") ||
        cmd.startsWith("extension.")
    )
    .slice(0, 50); // Limit to avoid overwhelming the list

  const vscodeItems: CommandQuickPickItem[] = commonVSCodeCommands.map(
    (cmd) => ({
      label: `$(symbol-event) ${cmd}`,
      description: "VS Code command",
      detail: "Built-in VS Code Command",
      commandId: cmd,
      isIxdar: false,
    })
  );

  const allItems = [...ixdarItems, ...vscodeItems];

  const selectedCommand = await vscode.window.showQuickPick(allItems, {
    placeHolder: "Select a command to execute on all files",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selectedCommand) {
    vscode.window.showErrorMessage("No command selected.");
    return;
  }

  // Step 3: Get all files in the folder
  vscode.window.showInformationMessage(
    `Scanning folder: ${selectedFolder.fsPath}`
  );
  const files = await fs.getAllFiles(selectedFolder);

  if (files.length === 0) {
    vscode.window.showWarningMessage("No files found in the selected folder.");
    return;
  }

  // Step 4: Confirm execution
  const confirmation = await vscode.window.showWarningMessage(
    `Execute "${selectedCommand.label}" on ${files.length} files?`,
    { modal: true },
    "Yes",
    "No"
  );

  if (confirmation !== "Yes") {
    return;
  }

  // Step 5: Execute command on each file
  let successCount = 0;
  let errorCount = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Executing ${selectedCommand.commandId}`,
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < files.length; i++) {
        if (token.isCancellationRequested) {
          vscode.window.showWarningMessage("Operation cancelled by user.");
          break;
        }

        const file = files[i];
        progress.report({
          message: `Processing file ${i + 1}/${files.length}: ${path.basename(file.fsPath)}`,
          increment: 100 / files.length,
        });

        try {
          const document = await vscode.workspace.openTextDocument(file);
          await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: true,
          });

          await vscode.commands.executeCommand(selectedCommand.commandId);

          if (document.isDirty) {
            await document.save();
          }

          successCount++;
        } catch (error: any) {
          console.error(`Error processing ${file.fsPath}:`, error);
          errorCount++;
        }
      }
    }
  );

  vscode.window.showInformationMessage(
    `Completed: ${successCount} successful, ${errorCount} errors`
  );
};

const mcpFunc = async (args: any): Promise<McpResult> => {
  try {
    const { folderPath, commandName: targetCommandName } = args;

    const folderUri = vscode.Uri.file(folderPath);

    try {
      await vscode.workspace.fs.stat(folderUri);
    } catch {
      return mcp.returnMcpError({ error: `Folder not found: ${folderPath}` });
    }

    // Get the command
    const registry = CommandRegistry.getInstance();
    const allCommands = registry.getAllMcpCommands();

    const targetCommand = allCommands.find(
      (cmd) =>
        cmd.vscodeCommand.id === targetCommandName ||
        cmd.vscodeCommand.id.endsWith(`.${targetCommandName}`) ||
        cmd.name === targetCommandName
    );

    if (!targetCommand) {
      // Try as VS Code command
      const vscodeCommands = await vscode.commands.getCommands(true);
      if (!vscodeCommands.includes(targetCommandName)) {
        return mcp.returnMcpError({
          error: `Command not found: ${targetCommandName}`,
          availableCommands: allCommands.map((cmd) => cmd.name),
        });
      }
    }

    // Get all files
    const files = await fs.getAllFiles(folderUri);

    if (files.length === 0) {
      return mcp.returnMcpResult({
        success: true,
        message: "No files found in folder",
        filesProcessed: 0,
      });
    }

    // Execute command on each file
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: true,
        });

        const cmdId = targetCommand
          ? targetCommand.vscodeCommand.id
          : targetCommandName;
        await vscode.commands.executeCommand(cmdId);

        if (document.isDirty) {
          await document.save();
        }

        successCount++;
      } catch (error: any) {
        errorCount++;
        errors.push(`${file.fsPath}: ${error.message}`);
      }
    }

    return mcp.returnMcpResult({
      success: true,
      totalFiles: files.length,
      successCount,
      errorCount,
      errors: errors.slice(0, 10), // Limit error list
    });
  } catch (error: any) {
    return mcp.returnMcpError({ error: error.message });
  }
};

const description =
  "Call any ix command or vscode command over all files and sub folders of a given folder";
const inputSchema = {
  type: "object",
  properties: {
    folderPath: {
      type: "string",
      description: "Absolute path to the folder to process",
    },
    commandName: {
      type: "string",
      description:
        "Name or ID of the command to execute on each file (e.g., 'removeAllComments' or 'editor.action.formatDocument')",
    },
  },
  required: ["folderPath", "commandName"],
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
