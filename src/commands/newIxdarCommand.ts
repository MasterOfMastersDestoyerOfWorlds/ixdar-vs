import * as importer from "@/utils/templating/importer";
import * as vscode from "vscode";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as inputs from "@/utils/vscode/userInputs";
import * as fs from "@/utils/vscode/fs";
import { CommandPipeline } from "@/types/command/commandModule";

function ixdarCommandTemplate(
  additionalImports: string,
  newCommandName: any,
  newCommandDescription: any,
  indentedBody: string
) {
  return `
${importer.getImportModule("vscode")}
${importer.getImportRelative(commandModule, commandRegistry, CommandInputPlan)}
import { CommandPipeline } from "@/types/command/commandModule";
${additionalImports}
/**
 * @ix-description ${newCommandName}: ${newCommandDescription}
 */
const languages = undefined;
const repoName = undefined;

const pipeline: CommandPipeline = {
  input: () =>
    ${importer.getModuleName(CommandInputPlan)}.createInputPlan()
    // Add input steps with builder.step(...)
    .build(),
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

const command: ${importer.getModuleName(commandModule)}.CommandModule = new ${importer.getModuleName(commandModule)}.CommandModuleImpl({
  repoName,
  ixModule: __ix_module,
  languages,
  pipeline,
});

@${importer.getModuleName(commandRegistry)}.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
`;
}

/**
 *  @ix-description newIxdarCommand: Create a new command template file in the commands folder with optional AI-generated code.
 */

const languages = undefined;
const repoName = importer.EXTENSION_NAME;

const pipeline: CommandPipeline = {
  input: () =>
    CommandInputPlan.createInputPlan()
      .step(inputs.commandNameInput())
      .step(inputs.commandDescriptionInput({ required: false }))
      .build(),
  execute: async (context, inputs) => {
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
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result) {
      return;
    }

    context.addMessage(
      `Command ${result.commandName} created at ${result.filePath}.`
    );
  },
};

const command: commandModule.CommandModule =
  new commandModule.CommandModuleImpl({
    repoName,
    ixModule: __ix_module,
    languages,
    pipeline,
  });

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
