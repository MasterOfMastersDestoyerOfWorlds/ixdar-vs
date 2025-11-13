import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as userInputs from "@/utils/vscode/userInputs";
import { CommandPipeline } from "@/types/command/commandModule";

/**
 * ixCommand: In-memory command runner that allows executing any registered command
 * via a quick pick interface (VS Code) or by name (MCP).
 */
const commandName = "ixCommand";
const languages = undefined;
const repoName = undefined;

interface CommandResult {
  executed: boolean;
  commandId: string;
  mode: commandModule.CommandMode;
  mcpResult?: commandModule.McpResult | undefined;
}

const pipeline: CommandPipeline = {
  input: () =>
    CommandInputPlan.createInputPlan()
      .step(userInputs.commandInput())
      .step(userInputs.commandArgsInput())
      .build(),
  execute: async (context, inputs) => {
    if (context.mode === "vscode") {
      await commandRegistry.executeCommand(inputs.commandId);
      return {
        executed: true,
        commandId: inputs.commandId.vscodeCommand.id,
        mode: context.mode,
      };
    }

    if (!inputs.commandId.mcp?.enabled) {
      throw new Error(
        `Command '${inputs.commandId.name}' is not available for MCP execution.`
      );
    }

    const result = await inputs.commandId.mcp.call(inputs.args);
    return {
      executed: true,
      commandId: inputs.commandId.vscodeCommand.id,
      mode: context.mode,
      mcpResult: result,
    };
  },
  cleanup: async (context, inputs, result, error) => {
    if (error || !result) {
      return;
    }
    context.addMessage(`Executed command ${inputs.commandId.vscodeCommand.id}`);
  },
};

const description =
  "Run any registered command from the command registry. Use quick pick in VS Code or specify command name via MCP.";

const command: commandModule.CommandModule =
  new commandModule.CommandModuleImpl({
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
