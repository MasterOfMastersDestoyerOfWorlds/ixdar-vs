import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import { runWithAvailabilityGuard } from "@/utils/availability";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";
import * as aiCodeGenerator from "@/utils/aiCodeGenerator";

function ixdarCommandTemplate(
  additionalImports: string,
  newCommandName: any,
  newCommandDescription: any,
  indentedBody: string
) {
  return `
import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";
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
  mcpFunc,
  description,
  inputSchema
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
const repoName = strings.extensionName();
const commandFunc = async () => {
  const newCommandName = await vscode.window.showInputBox({
    prompt: "Enter a name for your new command (e.g. myNewCommand):",
    validateInput: (value) => {
      if (!value || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        return "Please enter a valid TypeScript identifier.";
      }
      return null;
    },
  });
  if (!newCommandName) {
    return;
  }

  const newCommandDescription = await vscode.window.showInputBox({
    prompt: "Enter a description that we will use to build this command",
  });
  if (!newCommandDescription) {
    return;
  }

  const commandTypeSelection = await vscode.window.showQuickPick(
    [
      {
        label: "Basic Template",
        value: "basic",
        description: "Empty template with name and description only",
      },
      {
        label: "Low-Level Command (AI)",
        value: "low-level",
        description: "AI generates custom implementation code",
      },
      {
        label: "High-Level Command (AI)",
        value: "high-level",
        description: "AI generates code that calls other ix commands",
      },
    ],
    { placeHolder: "Select command type" }
  );

  if (!commandTypeSelection) {
    return;
  }

  const commandType = commandTypeSelection.value as
    | "basic"
    | "low-level"
    | "high-level";

  let commandNames: string[] = [];
  if (commandType === "high-level") {
    const commandNamesInput = await vscode.window.showInputBox({
      prompt:
        "Enter command names to orchestrate (comma-separated, e.g., removeAllComments, package)",
      placeHolder: "command1, command2, command3",
    });

    if (!commandNamesInput) {
      return;
    }

    commandNames = commandNamesInput
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }

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

  try {
    await vscode.workspace.fs.stat(newFileUri);
    vscode.window.showWarningMessage(
      `File for command '${newCommandName}' already exists.`
    );
    return;
  } catch {}

  let commandFuncBody = "";
  let additionalImports = "";

  if (commandType === "low-level") {
    try {
      vscode.window.showInformationMessage(
        "Generating low-level command code with AI..."
      );
      commandFuncBody = await aiCodeGenerator.generateLowLevelCode(
        newCommandDescription
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to generate code: ${error.message}`
      );
      return;
    }
  } else if (commandType === "high-level") {
    try {
      vscode.window.showInformationMessage(
        "Generating high-level orchestration code with AI..."
      );
      commandFuncBody = await aiCodeGenerator.generateHighLevelCode(
        newCommandDescription,
        commandNames
      );
      additionalImports = `import { CommandRegistry } from "@/utils/commandRegistry";\n`;
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to generate code: ${error.message}`
      );
      return;
    }
  }

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
  vscode.window.showInformationMessage(
    `New command file created: ${newFileUri.fsPath}`
  );
  await vscode.window.showTextDocument(newFileUri);
};

const mcpFunc = async (args: any): Promise<McpResult> => {
  try {
    const newCommandName = args.newCommandName;
    const newCommandDescription = args.description || "";
    const commandType = (args.commandType || "basic") as
      | "basic"
      | "low-level"
      | "high-level";
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

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newCommandName)) {
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
    if (commandType === "high-level") {
      commandNames = commandNamesInput
        .split(",")
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 0);
    }

    let commandFuncBody = "";
    let additionalImports = "";

    if (commandType === "low-level") {
      if (!newCommandDescription) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "description is required for low-level commands",
              }),
            },
          ],
          isError: true,
        };
      }
      commandFuncBody = await aiCodeGenerator.generateLowLevelCode(
        newCommandDescription
      );
    } else if (commandType === "high-level") {
      if (!newCommandDescription) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "description is required for high-level commands",
              }),
            },
          ],
          isError: true,
        };
      }
      if (commandNames.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "commandNames is required for high-level commands",
              }),
            },
          ],
          isError: true,
        };
      }
      commandFuncBody = await aiCodeGenerator.generateHighLevelCode(
        newCommandDescription,
        commandNames
      );
      additionalImports = `import { CommandRegistry } from "@/utils/commandRegistry";\n`;
    }

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
              commandType,
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
    commandType: {
      type: "string",
      enum: ["basic", "low-level", "high-level"],
      description:
        "Type of command: basic (empty template), low-level (AI generates implementation), high-level (AI generates orchestration)",
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
  mcpFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
