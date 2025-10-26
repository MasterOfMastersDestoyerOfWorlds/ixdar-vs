import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "../types/command";
import { runWithAvailabilityGuard } from "../utils/availability";
import * as strings from "../utils/strings";
import * as mcp from "../utils/mcp";

const commandName = "onZBreakPoint";
const languages = ["c", "cpp", "java", "csharp"];
const repoName = undefined;
const commandFunc = async () => {
    try {
        // This command installs from a local file URI
        await vscode.commands.executeCommand('workbench.extensions.installVsix', vsixUri);
        
        vscode.window.showInformationMessage(`Successfully installed extension from ${vsixUri.fsPath}.`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to install VSIX from ${vsixUri.fsPath}: ${error}`);
      }
};

const mcpFunc = mcp.executeCommand(commandName, (args: any) => `Extension ${strings.extensionName()} packaged and installed`);

const description = "Package the current extension into a VSIX file and install it."
const inputSchema = {
	type: "object", properties: {} 
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

export default command;
