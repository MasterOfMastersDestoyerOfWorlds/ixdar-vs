import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as strings from "@/utils/strings";
import { CommandRegistry, RegisterCommand } from "@/utils/commandRegistry";

/**
 * ixCommand: In-memory command runner that allows executing any registered command
 * via a quick pick interface (VS Code) or by name (MCP).
 */
const commandName = "ixCommand";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const registry = CommandRegistry.getInstance();
  const allCommands = registry.getAll();

  if (allCommands.length === 0) {
    vscode.window.showWarningMessage("No commands are registered.");
    return;
  }

  interface CommandQuickPickItem extends vscode.QuickPickItem {
    commandModule: CommandModule;
  }

  const items: CommandQuickPickItem[] = allCommands.map((cmd) => ({
    label: cmd.vscodeCommand.id,
    description: cmd.mcp.tool.description,
    detail: `Category: ${cmd.meta.category}${cmd.meta.languages ? ` | Languages: ${cmd.meta.languages.join(", ")}` : ""}`,
    commandModule: cmd,
  }));

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

    if (!commandName) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "commandName is required" }),
          },
        ],
        isError: true,
      };
    }

    const registry = CommandRegistry.getInstance();
    const allCommands = registry.getAll();

    const targetCommand = allCommands.find(
      (cmd) =>
        cmd.vscodeCommand.id === commandName ||
        cmd.vscodeCommand.id.endsWith(`.${commandName}`) ||
        cmd.mcp.tool.name === commandName
    );

    if (!targetCommand) {
      const availableCommands = allCommands.map((cmd) => ({
        id: cmd.vscodeCommand.id,
        name: cmd.mcp.tool.name,
        description: cmd.mcp.tool.description,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: `Command '${commandName}' not found`,
                availableCommands,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const result = await targetCommand.mcp.call(args.args || {});

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              executedCommand: targetCommand.vscodeCommand.id,
              result,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: error.message }) },
      ],
      isError: true,
    };
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
  mcpFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
