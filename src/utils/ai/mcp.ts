import { McpResult } from "@/types/command/commandModule";
import * as vscode from "vscode";
import * as importer from "@/utils/templating/importer";
import * as strings from "@/utils/templating/strings";

/**
 * @ix-module-description Use this module to create outputs for the MCP server.
 */

/**
 * Execute a command and return the result as an MCP result.
 * @param commandName - The name of the command to execute.
 * @param message - The message to return as an MCP result.
 * @returns A function that can be used as an MCP tool.
 */

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

/**
 * Return an MCP result.
 * @param message - The message to return as an MCP result.
 * @returns An MCP result.
 */
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

/**
 * Return an MCP error.
 * @param message - The message to return as an MCP error.
 * @returns An MCP error.
 */
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

/**
 * Return an MCP success.
 * @param result - The result to return as an MCP success.
 * @returns An MCP success.
 */
export function returnMcpSuccess(result: any): McpResult {
  return returnMcpResult({
    success: true,
    result: JSON.stringify(result, null, 2),
  });
}

/**
 * List all IX commands.
 * @param prefix - The prefix to filter the commands by.
 * @returns A list of IX commands.
 */
export async function listIxCommads(prefix?: string): Promise<any> {
  prefix = prefix ?? (importer.EXTENSION_PREFIX as string);
  const allCommands = await vscode.commands.getCommands(true);
  const filtered = allCommands.filter((id) => id.startsWith(prefix));
  return returnMcpResult({ commands: filtered });
}
