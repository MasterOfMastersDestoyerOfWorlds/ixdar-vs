import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as userInputs from "@/utils/vscode/userInputs";

/**
 * ixCommand: In-memory command runner that allows executing any registered command
 * via a quick pick interface (VS Code) or by name (MCP).
 */
const commandName = "ixCommand";
const languages = undefined;
const repoName = undefined;

interface InputValues {
  command: commandModule.CommandModule;
  args: Record<string, unknown>;
}

interface CommandResult {
  executed: boolean;
  commandId: string;
  mode: commandModule.CommandMode;
  mcpResult?: commandModule.McpResult | undefined;
}

const pipeline: commandModule.CommandPipeline<InputValues, CommandResult> = {
  input: () =>
    CommandInputPlan.createInputPlan<InputValues>((builder) => {
      builder.step({
        key: "command",
        schema: {
          type: "string",
          description:
            "The name or ID of the command to execute (e.g., 'newIxdarCommand' or 'ixdar-vs.newIxdarCommand')",
        },
        prompt: async () => {
          const items = commandRegistry.getMcpCommandQuickPickItems();
          const selected = await userInputs.selectCommandQuickPickItem(items);
          return selected.commandModule;
        },
        resolveFromArgs: async ({ args }) => {
          const commandNameArg = args.commandName;
          if (typeof commandNameArg !== "string" || commandNameArg.length === 0) {
            throw new Error("Property 'commandName' is required.");
          }
          return commandRegistry.findCommandById(commandNameArg);
        },
      });

      builder.step({
        key: "args",
        schema: {
          type: "object",
          description:
            "Optional arguments to pass to the command being executed (MCP only).",
        },
        required: false,
        defaultValue: {},
        prompt: async () => ({}),
        resolveFromArgs: async ({ args }) => {
          const provided = args.args;
          if (provided && typeof provided === "object") {
            return provided as Record<string, unknown>;
          }
          return {};
        },
      });
    }),
  execute: async (context, inputs) => {
    if (context.mode === "vscode") {
      await commandRegistry.executeCommand(inputs.command);
      return {
        executed: true,
        commandId: inputs.command.vscodeCommand.id,
        mode: context.mode,
      };
    }

    if (!inputs.command.mcp?.enabled) {
      throw new Error(
        `Command '${inputs.command.name}' is not available for MCP execution.`
      );
    }

    const result = await inputs.command.mcp.call(inputs.args);
    return {
      executed: true,
      commandId: inputs.command.vscodeCommand.id,
      mode: context.mode,
      mcpResult: result,
    };
  },
  cleanup: async (context, inputs, result, error) => {
    if (error || !result) {
      return;
    }
    context.addMessage(`Executed command ${inputs.command.vscodeCommand.id}`);
  },
};

const description =
  "Run any registered command from the command registry. Use quick pick in VS Code or specify command name via MCP.";

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl<
  InputValues,
  CommandResult
>({
  repoName,
  commandName,
  languages,
  description,
  pipeline,
});

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
