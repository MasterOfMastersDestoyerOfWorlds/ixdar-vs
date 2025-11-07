import * as vscode from "vscode";
import {
  CommandModuleImpl,
  McpResult,
  type CommandModule,
} from "@/types/command";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as mcp from "@/utils/ai/mcp";
import * as inputs from "@/utils/vscode/input";
import { CommandQuickPickItem } from "@/utils/command/commandRegistry";

/**
 * ixCommand: In-memory command runner that allows executing any registered command
 * via a quick pick interface (VS Code) or by name (MCP).
 */
const commandName = "ixCommand";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const items = commandRegistry.getMcpCommandQuickPickItems();
  const selected = await inputs.selectCommandQuickPickItem(items);
  await commandRegistry.executeCommand(selected.commandModule);
};

const mcpFunc = async (args: any): Promise<McpResult> => {
  try {
    const commandName = args.commandName;
    const targetCommand = commandRegistry.findCommandById(commandName);
    const result = await targetCommand.mcp?.call(args.args || {});
    return mcp.successMcpResult(result);
  } catch (error: any) {
    return mcp.returnMcpError(error.message);
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
        "The name or ID of the command to execute (e.g., 'newIxdarCommand' or '${importer.EXTENSION_NAME}.newIxdarCommand')",
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
