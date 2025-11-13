import * as importer from "@/utils/templating/importer";
import * as vscode from "vscode";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as inputs from "@/utils/vscode/userInputs";
import * as fs from "@/utils/vscode/fs";

function ixdarCommandTemplate(
  additionalImports: string,
  newCommandName: any,
  newCommandDescription: any,
  indentedBody: string
) {
  return `
${importer.getImportModule("vscode")}
${importer.getImportRelative(commandModule, commandRegistry)}
${additionalImports}
/**
 * ${newCommandName}: ${newCommandDescription}
 */
const commandName = "${newCommandName}";
const languages = undefined;
const repoName = undefined;

type InputValues = Record<string, never>;
type CommandResult = void;

const pipeline: ${importer.getModuleName(commandModule)}.CommandPipeline<InputValues, CommandResult> = {
  input: () =>
    ${importer.getModuleName(commandModule)}.createInputPlan<InputValues>(() => {
      // Add input steps with builder.step(...)
    }),
  execute: async (_context, _inputs) => {
${indentedBody}
  },
  cleanup: async (context, _inputs, _result, error) => {
    if (error) {
      return;
    }
    context.addMessage("${newCommandName} completed.");
  },
};

const description = "${newCommandDescription.replace(/"/g, '\\"')}";
const command: ${importer.getModuleName(commandModule)}.CommandModule = new ${importer.getModuleName(commandModule)}.CommandModuleImpl<InputValues, CommandResult>({
  repoName,
  commandName,
  languages,
  description,
  pipeline,
});

@${importer.getModuleName(commandRegistry)}.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
`;
}

const commandName = "newIxdarCommand";
const languages = undefined;
const repoName = importer.EXTENSION_NAME;

interface CommandResult {
  filePath: string;
  commandName: string;
  description: string;
}

const pipeline = {
  input: () =>
    CommandInputPlan.createInputPlan()
      .step(inputs.commandNameInput())
      .step(inputs.commandDescriptionInput({ required: false }))
      .build(),
  execute: async (
    context: commandModule.CommandRuntimeContext,
    inputs: { newCommandName: string; description: string }
  ) => {
    const workspaceFolder = fs.getWorkspaceFolder();
    const commandsFolderUri = await fs.getCommandsFolderUri(workspaceFolder);
    const newFileUri = vscode.Uri.joinPath(
      commandsFolderUri,
      `${inputs.newCommandName}.ts`
    );

    await fs.checkFileExists(newFileUri);

    const commandFuncBody = "// TODO: implement command logic";
    const additionalImports = "";

    const indentedBody = commandFuncBody
      .split("\n")
      .map((line) => (line ? `    ${line}` : line))
      .join("\n");

    const template = ixdarCommandTemplate(
      additionalImports,
      inputs.newCommandName,
      inputs.description,
      indentedBody
    );

    await fs.createFile(newFileUri, template);

    if (context.collectFile) {
      await context.collectFile(
        newFileUri.fsPath,
        `Created command ${inputs.newCommandName}`
      );
    }

    return {
      filePath: newFileUri.fsPath,
      commandName: inputs.newCommandName,
      description: inputs.description,
    };
  },
  cleanup: async (
    context: commandModule.CommandRuntimeContext,
    _inputs: { newCommandName: string; description: string },
    result: CommandResult | undefined,
    error?: unknown
  ) => {
    if (error || !result) {
      return;
    }

    context.addMessage(
      `Command ${result.commandName} created at ${result.filePath}.`
    );
  },
};

const description =
  "Create a new command template file in the commands folder with optional AI-generated code.";

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl({
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
