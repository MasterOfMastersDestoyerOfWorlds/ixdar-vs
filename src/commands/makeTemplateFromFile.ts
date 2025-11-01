import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";

/**
 * makeTemplateFromFile: Make a template function from a file by replacing target variables with case-specific template literals.
 */
const commandName = "makeTemplateFromFile";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }
  let content = editor.document.getText();

  const targetsInput = await vscode.window.showInputBox({
    prompt:
      "Enter target variable names (comma-separated, e.g., makeTemplateFromFile, myVariable)",
    placeHolder: "target1, target2, target3",
  });

  if (!targetsInput || targetsInput.length === 0) {
    return;
  }

  const targets = targetsInput
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const targetIndex = i;

    const caseVariations = strings.getAllCases(target);

    const caseMap = new Map<string, strings.StringCases>();
    caseVariations.forEach((variation) => {
      const caseType = strings.getStringCase(variation);
      caseMap.set(variation, caseType);
    });

    for (const variation of caseMap.keys()) {
      const caseType = caseMap.get(variation)!;
      const functionName = strings.getFunctionForCase(caseType);

      if (functionName) {
        const replacement = `\${${functionName}(arg${targetIndex})}`;

        const regex = new RegExp(`\\b${escapeRegex(variation)}\\b`, "g");
        content = content.replace(regex, replacement);
      }
    }
  }

  const argsList = targets.map((_, i) => `arg${i}`).join(", ");
  const templateFunction = `function makeTemplate(${argsList}: string) {\n  return \`${content}\`;\n}`;

  editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, templateFunction);
  });

  vscode.window.showInformationMessage(
    `Template function created with ${targets.length} target(s).`
  );
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const mcpFunc = mcp.executeCommand(commandName, (args: any) => {
  const targets = Array.isArray(args.replaceTargets)
    ? args.replaceTargets
    : [args.replaceTargets];
  return `Made template from ${args.fileToTemplate} replacing targets: ${targets.join(", ")}`;
});

const description =
  "Make a template function from a file by replacing target variables with case-specific template literals.";
const inputSchema = {
  type: "object",
  properties: {
    fileToTemplate: {
      type: "string",
      description: "Path to the file to use as template",
    },
    replaceTargets: {
      type: "array",
      description:
        "Target variable names to replace (comma-separated string or array)",
    },
  },
  required: ["fileToTemplate", "replaceTargets"],
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
