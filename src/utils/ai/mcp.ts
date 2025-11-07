import { McpResult } from "@/types/command";
import * as vscode from "vscode";
import * as importer from "@/utils/templating/importer";
import * as strings from "@/utils/templating/strings";
export function executeCommand(
  commandName: string,
  message: string | ((args: any) => string)
): (args: any) => Promise<McpResult> {
  const mcpFunc = async (args: any): Promise<McpResult> => {
    const editor = vscode.window.activeTextEditor;
    await vscode.commands.executeCommand(
      importer.extensionCommandName(commandName)
    );
    return returnMcpResult({
      success: true,
      message: typeof message === "function" ? message(args) : message,
    });
  };
  return mcpFunc;
}

export function returnMcpResult(message: any): McpResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(message, null, 2),
      },
    ],
  };
}

export function returnMcpError(message: any): McpResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(message, null, 2),
      },
    ],
    isError: true,
  };
}

export function successMcpResult(result: any): McpResult {
  return returnMcpResult({
    success: true,
    result: JSON.stringify(result, null, 2),
  });
}
export async function listIxCommads(prefix?: string): Promise<any> {
  prefix = prefix ?? (importer.EXTENSION_PREFIX as string);
  const allCommands = await vscode.commands.getCommands(true);
  const filtered = allCommands.filter((id) => id.startsWith(prefix));
  return returnMcpResult({ commands: filtered });
}
