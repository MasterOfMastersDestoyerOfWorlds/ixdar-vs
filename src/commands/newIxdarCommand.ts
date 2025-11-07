import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as aiCodeGenerator from "@/utils/ai/aiCodeGenerator";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import * as vscode from "vscode";
import * as mcp from "@/utils/ai/mcp";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as commandModule from "@/types/command";
import * as inputs from "@/utils/vscode/input";
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

const mcpFunc = mcp.executeCommand(commandName, (args: any) => "Command ${newCommandName} executed");

const description = "${newCommandDescription.replace(/"/g, '\\"')}";
const inputSchema = {
  type: "object",
  properties: {},
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

@RegisterCommand
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
  const wsFolders = vscode.workspace.workspaceFolders;
  if (!wsFolders || wsFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return;
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

const mcpFunc = async (args: any): Promise<McpResult> => {
  try {
    const newCommandName = args.newCommandName;
    const newCommandDescription = args.description || "";
    const commandNamesInput = args.commandNames || "";

    if (!newCommandName) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "newCommandName is required" }),
          },
        ],
        isError: true,
      };
    }

    if (!strings.isValidIdentifier(newCommandName)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                "Invalid command name. Must be a valid TypeScript identifier.",
            }),
          },
        ],
        isError: true,
      };
    }

    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || wsFolders.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "No workspace folder is open" }),
          },
        ],
        isError: true,
      };
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `File for command '${newCommandName}' already exists`,
            }),
          },
        ],
        isError: true,
      };
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

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message: `Command ${newCommandName} created successfully`,
              filePath: newFileUri.fsPath,
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

const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  description,
  inputSchema,
  mcpFunc
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
