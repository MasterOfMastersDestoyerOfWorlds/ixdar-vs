import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/command";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import * as mcp from "@/utils/ai/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as fs from "@/utils/vscode/fs";
import * as inputs from "@/utils/vscode/input";

/**
 * makeTemplateFromFile: Make a template function from a file by replacing target variables with case-specific template literals.
 */
const commandName = "makeTemplateFromFile";
const languages = undefined;
const repoName = undefined;

export async function makeTemplateFromFile(
  content: string,
  targets: string[],
  fileNameInput: string
) {
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
        const replacement = `\${${importer.getCallSign(strings)}(${functionName}(arg${targetIndex})}`;

        const regex = new RegExp(
          `\\b${strings.escapeRegex(variation)}\\b`,
          "g"
        );
        content = content.replace(regex, replacement);
      }
    }
  }

  const argsList = targets.map((_, i) => `arg${i}`).join(", ");
  const templateFunction = `
${importer.getIxdarImport()}";
${importer.getImport(strings)}
export function makeTemplate(${argsList}: string) {\n  return \`${content}\`;\n}`;

  const templateFile = await fs.createTemplateFile(
    templateFunction,
    fileNameInput
  );

  return templateFile;
}

const commandFunc = async () => {
  const editor = inputs.getActiveEditor();
  let content = editor.document.getText();

  const targets = await inputs.getReplacementTargets();
  const fileNameInput = await inputs.getFileNameInput(editor.document.fileName);

  const templateFile = await makeTemplateFromFile(
    content,
    targets,
    fileNameInput
  );
  vscode.window.showInformationMessage(
    `Template function created in ${templateFile.fsPath}`
  );
};

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
