import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import { runWithAvailabilityGuard } from "@/utils/availability";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";

const commandName = "newIxdarCommand";
const languages = undefined;
const repoName = strings.extensionName();
const commandFunc = async () => {
  // This command creates a new command template file in the commands folder.
  const newCommandName = await vscode.window.showInputBox({
    prompt: "Enter a name for your new command (e.g. myNewCommand):",
    validateInput: (value) => {
      if (!value || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        return "Please enter a valid TypeScript identifier.";
      }
      return null;
    }
  });
  if (!newCommandName) {
    return;
  }

  // Determine file path
  const wsFolders = vscode.workspace.workspaceFolders;
  if (!wsFolders || wsFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return;
  }
  const commandsFolderUri = vscode.Uri.joinPath(wsFolders[0].uri, "src", "commands");
  const newFileUri = vscode.Uri.joinPath(commandsFolderUri, `${newCommandName}.ts`);

  // File template
  const template = `
import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";

/**
 * ${newCommandName}: Describe what your command does here.
 */
const commandName = "${newCommandName}";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {

};

const mcpFunc = mcp.executeCommand(commandName, (args: any) => "Command ${newCommandName} created");

const description = "Describe '${newCommandName}' here.";
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
`;
  try {
    await vscode.workspace.fs.stat(newFileUri);
    vscode.window.showWarningMessage(`File for command '${newCommandName}' already exists.`);
    return;
  } catch {
  }

  await vscode.workspace.fs.createDirectory(commandsFolderUri); // Ensure the directory exists
  await vscode.workspace.fs.writeFile(newFileUri, Buffer.from(template, 'utf8'));
  vscode.window.showInformationMessage(`New command file created: ${newFileUri.fsPath}`);
  await vscode.window.showTextDocument(newFileUri);
};

const mcpFunc = mcp.executeCommand(commandName, (args: any) => `Command ${args.newCommandName} created`);

const description = "Create a new command template file in the commands folder."
const inputSchema = {
	type: "object", properties: {
		newCommandName: { type: "string", description: "The name of the new command to create" },
	},
	required: ["newCommandName"],
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