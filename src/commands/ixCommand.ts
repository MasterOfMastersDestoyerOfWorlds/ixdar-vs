import * as vscode from "vscode";
import {
  CommandModuleImpl,
  McpResult,
  type CommandModule,
} from "@/types/command";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as mcp from "@/utils/ai/mcp";

/**
 * ixCommand: In-memory command runner that allows executing any registered command
 * via a quick pick interface (VS Code) or by name (MCP).
 */
const commandName = "ixCommand";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const items = commandRegistry.getMcpCommandQuickPickItems();
  if (items.length === 0) {
    return;
  }
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a command to execute",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  try {
    await vscode.commands.executeCommand(
      selected.commandModule.vscodeCommand.id
    );
    vscode.window.showInformationMessage(`Executed: ${selected.label}`);
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to execute command: ${error.message}`
    );
  }
};

const mcpFunc = async (args: any): Promise<McpResult> => {
  try {
    const commandName = args.commandName;
    const targetCommand = commandRegistry.findCommandById(commandName);

    if (targetCommand instanceof McpResult) {
      return targetCommand;
    }

    const result = await targetCommand.mcp?.call(args.args || {});

    return mcp.returnMcpResult({
      success: true,
      executedCommand: targetCommand.vscodeCommand.id,
      result,
    });
  } catch (error: any) {
    return mcp.returnMcpResult({ error: error.message });
  }
};

const description =
  "Run any registered command from the command registry. Use quick pick in VS Code or specify command name via MCP.";
const inputSchema = {
  type: "object",
  properties: {
    commandName: {
      type: "string",
      description:
        "The name or ID of the command to execute (e.g., 'newIxdarCommand' or 'ixdar-vs.newIxdarCommand')",
    },
    args: {
      type: "object",
      description: "Optional arguments to pass to the command being executed",
    },
  },
  required: ["commandName"],
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

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
