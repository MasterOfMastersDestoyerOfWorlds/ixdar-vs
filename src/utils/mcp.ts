import { McpResult } from "../types/command";
import * as vscode from "vscode";
import * as strings from "./strings";

export function executeCommand(commandName: string, message: string | ((args: any) => string)): (args: any) => Promise<McpResult> {
  const mcpFunc = async (args: any): Promise<McpResult> => {
    const editor = vscode.window.activeTextEditor;
    await vscode.commands.executeCommand(
      strings.extensionCommandName(commandName)
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: typeof message === "function" ? message(args) : message,
          }),
        },
      ],
    };
  };
  return mcpFunc;
}
