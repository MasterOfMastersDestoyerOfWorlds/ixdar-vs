
import * as vscode from "vscode";
import * as commandModule from '@/types/commandModule';
import * as mcp from '@/utils/ai/mcp';
import * as utilRegistry from '@/utils/utilRegistry';
import * as fs from '@/utils/vscode/fs';
import * as commandRegistry from '@/utils/command/commandRegistry';


/**
 * listUtilsModules: List all util modules in the registry and output them to a temporary file
 */
const commandName = "listUtilsModules";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  try {
    const registry = utilRegistry.UtilRegistry.getInstance();
    const utilModules = registry.getAllModules();

    if (utilModules.length === 0) {
      vscode.window.showWarningMessage("No utility modules are currently registered.");
      return;
    }

    const generatedAt = new Date();
    const sortedModules = [...utilModules].sort((a, b) => a.name.localeCompare(b.name));
    const moduleLines = sortedModules.map((module, index) => {
      const location = module.filePath ? ` (${module.filePath})` : "";
      return `${index + 1}. ${module.name}${location}`;
    });

    const content = [
      "Util Registry Modules",
      `Generated: ${generatedAt.toISOString()}`,
      `Total Modules: ${sortedModules.length}`,
      "",
      ...moduleLines,
      "",
    ].join("\n");

    const timestamp = generatedAt.toISOString().replace(/[:.]/g, "-");
    const baseName = commandName
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase();
    const targetFileName = `${baseName}-${timestamp}.txt`;

    const tempFileUri = await fs.writeWorkspaceTempFile(
      targetFileName,
      content
    );

    const document = await vscode.workspace.openTextDocument(tempFileUri);
    await vscode.window.showTextDocument(document, { preview: false });

    vscode.window.showInformationMessage(
      `Listed ${sortedModules.length} util modules to ${tempFileUri.fsPath}`
    );
  } catch (error: any) {
    const message =
      typeof error?.message === "string"
        ? error.message
        : "Unknown error listing util modules.";
    vscode.window.showErrorMessage(`Failed to list util modules: ${message}`);
  }
};

const mcpFunc = mcp.executeCommand(commandName, (args: any) => "Command listUtilsModules executed");

const description = "List all util modules in the registry and output them to a temporary file";
const inputSchema = {
  type: "object",
  properties: {},
};

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  description,
  inputSchema,
  mcpFunc
);

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
