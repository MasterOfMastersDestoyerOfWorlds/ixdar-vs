import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import * as vscode from "vscode";
import * as mcp from "@/utils/ai/mcp";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as commandModule from "@/types/commandModule";
import * as inputs from "@/utils/vscode/inputs";
import * as fs from "@/utils/vscode/fs";

function ixdarCommandTemplate(
  additionalImports: string,
  newCommandName: any,
  newCommandDescription: any,
  indentedBody: string
) {
  return `
${importer.getImportModule("vscode")}
${importer.getImportRelative(commandModule, strings, mcp, commandRegistry)}
${additionalImports}
/**
 * ${newCommandName}: ${newCommandDescription}
 */
const commandName = "${newCommandName}";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
${indentedBody}
};

const mcpFunc = ${importer.getModuleName(mcp)}.executeCommand(commandName, (args: any) => "Command ${newCommandName} executed");

const description = "${newCommandDescription.replace(/"/g, '\\"')}";
const inputSchema = {
  type: "object",
  properties: {},
};

const command: ${importer.getModuleName(commandModule)}.CommandModule = new ${importer.getModuleName(commandModule)}.CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  description,
  inputSchema,
  mcpFunc
);

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
const commandFunc = async () => {
  const newCommandName = await inputs.getCommandNameInput();
  const newCommandDescription = await inputs.getCommandDescriptionInput();
  const workspaceFolder = await fs.getWorkspaceFolder();
  const commandsFolderUri = await fs.getCommandsFolderUri(workspaceFolder);
  const newFileUri = vscode.Uri.joinPath(
    commandsFolderUri,
    `${newCommandName}.ts`
  );

  await fs.checkFileExists(newFileUri);

  let commandFuncBody = "";
  let additionalImports = "";

  const indentedBody = commandFuncBody
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");

  const template = ixdarCommandTemplate(
    additionalImports,
    newCommandName,
    newCommandDescription,
    indentedBody
  );

  await fs.createFile(newFileUri, template);
  await vscode.window.showTextDocument(newFileUri);
};

const mcpFunc = async (args: any): Promise<commandModule.McpResult> => {
  try {
    const newCommandName = args.newCommandName;
    const newCommandDescription = args.description || "";

    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || wsFolders.length === 0) {
      return mcp.returnMcpError("No workspace folder is open");
    }

    const commandsFolderUri = vscode.Uri.joinPath(
      wsFolders[0].uri,
      "src",
      "commands"
    );
    const newFileUri = vscode.Uri.joinPath(
      commandsFolderUri,
      `${newCommandName}.ts`
    );

    try {
      await vscode.workspace.fs.stat(newFileUri);
      return mcp.returnMcpError(
        `File for command '${newCommandName}' already exists`
      );
    } catch {}

    let commandNames: string[] = [];
    let commandFuncBody = "";
    let additionalImports = "";

    const indentedBody = commandFuncBody
      .split("\n")
      .map((line) => (line ? `  ${line}` : line))
      .join("\n");

    const template = ixdarCommandTemplate(
      additionalImports,
      newCommandName,
      newCommandDescription,
      indentedBody
    );

    await vscode.workspace.fs.createDirectory(commandsFolderUri);
    await vscode.workspace.fs.writeFile(
      newFileUri,
      Buffer.from(template, "utf8")
    );

    return mcp.returnMcpSuccess(
      `Command ${newCommandName} created successfully`
    );
  } catch (error: any) {
    return mcp.returnMcpError(error.message);
  }
};

const description =
  "Create a new command template file in the commands folder with optional AI-generated code.";
const inputSchema = {
  type: "object",
  properties: {
    newCommandName: {
      type: "string",
      description: "The name of the new command to create",
    },
    description: {
      type: "string",
      description:
        "Description of what the command should do (required for AI-generated commands)",
    },
    commandNames: {
      type: "string",
      description:
        "Comma-separated list of command names to orchestrate (required for high-level commands)",
    },
  },
  required: ["newCommandName"],
};

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl(
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
