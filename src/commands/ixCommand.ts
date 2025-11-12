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
      builder.step(userInputs.commandInput());

      builder.step(userInputs.commandArgsInput());
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
