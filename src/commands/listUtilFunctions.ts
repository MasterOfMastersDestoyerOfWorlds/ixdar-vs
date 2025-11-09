
import * as vscode from "vscode";
import * as commandModule from '@/types/commandModule';
import * as mcp from '@/utils/ai/mcp';
import * as fs from '@/utils/vscode/fs';
import * as utilFunctionsReport from '@/utils/command/utilFunctionsReport';
import * as commandRegistry from '@/utils/command/commandRegistry';


/**
 * listUtilFunctions: List all util functions in the registry and output them to a temporary file
 */
const commandName = "listUtilFunctions";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  try {
    const report = utilFunctionsReport.buildUtilFunctionsReport();

    if (report.totalFunctions === 0) {
      vscode.window.showWarningMessage("No utility functions are currently registered.");
      return;
    }

    const timestamp = report.generatedAt.toISOString().replace(/[:.]/g, "-");
    const baseName = commandName
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase();
    const targetFileName = `${baseName}-${timestamp}.txt`;

    const tempFileUri = await fs.writeWorkspaceTempFile(
      targetFileName,
      report.content
    );

    const document = await vscode.workspace.openTextDocument(tempFileUri);
    await vscode.window.showTextDocument(document, { preview: false });

    vscode.window.showInformationMessage(
      `Listed ${report.totalFunctions} util functions across ${report.totalModules} modules to ${tempFileUri.fsPath}`
    );
  } catch (error: any) {
    const message =
      typeof error?.message === "string"
        ? error.message
        : "Unknown error listing util functions.";
    vscode.window.showErrorMessage(`Failed to list util functions: ${message}`);
  }
};

const mcpFunc = async (_args: any) => {
  try {
    const report = utilFunctionsReport.buildUtilFunctionsReport();

    if (report.totalFunctions === 0) {
      return mcp.returnMcpResult({
        success: true,
        message: "No utility functions are currently registered.",
        totalFunctions: 0,
      });
    }

    const timestamp = report.generatedAt.toISOString().replace(/[:.]/g, "-");
    const baseName = commandName
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase();
    const targetFileName = `${baseName}-${timestamp}.txt`;

    const tempFileUri = await fs.writeWorkspaceTempFile(
      targetFileName,
      report.content
    );

    return mcp.returnMcpResult({
      success: true,
      totalFunctions: report.totalFunctions,
      totalModules: report.totalModules,
      filePath: tempFileUri.fsPath,
      content: report.content,
    });
  } catch (error: any) {
    const message =
      typeof error?.message === "string" ? error.message : "Unknown error";
    return mcp.returnMcpError({ error: message });
  }
};

const description = "List all util functions in the registry and output them to a temporary file";
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
