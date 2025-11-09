import * as vscode from "vscode";
import {
  CommandModuleImpl,
  type CommandModule,
  type McpResult,
} from "@/types/commandModule";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import * as parser from "@/utils/templating/parser";
import * as mcp from "@/utils/ai/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as fs from "@/utils/vscode/fs";
import { MethodInfo } from "@/types/parser";
import * as inputs from "@/utils/vscode/inputs";

/**
 * makeTemplateFromMethod: Lists all of the methods or functions in a file and allows you to make a template out of one of them
 */
const commandName = "makeTemplateFromMethod";
const languages = undefined;
const repoName = undefined;


/**
 * Extract all methods/functions from the parse tree
 */


export const makeTemplateFromMethod = async (method: MethodInfo, targets: string[], fileNameInput: string) => {
  let content = method.text;
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

        const regex = new RegExp(`\\b${strings.escapeRegex(variation)}\\b`, "g");
        content = content.replace(regex, replacement);
      }
    }
  }

  const argsList = targets.map((_, i) => `arg${i}`).join(", ");
  const templateFunction = `
${importer.getIxdarImport()}
${importer.getImport(strings)}
export function makeTemplate(${argsList}: string) {
  return \`${content}\`;
}`;

  const templateFile = await fs.createTemplateFile(
    templateFunction,
    fileNameInput
  );

  return templateFile;
};

const commandFunc = async () => {
  const editor = inputs.getActiveEditor();

  const document = editor.document;
  const tree = parser.getParseTree(document);
  const language = parser.getLanguage(document.languageId);
  const methods = parser.extractMethods(tree, document, language);
  const method = await inputs.getMethod(methods);
  const targets = await inputs.getReplacementTargets();
  const fileNameInput = await inputs.getFileNameInput(method.name);
  const templateFile = await makeTemplateFromMethod(method, targets, fileNameInput);
  vscode.window.showInformationMessage(
    `Template function created in ${templateFile.fsPath}`
  );
};


const mcpFunc = mcp.executeCommand(commandName, (args: any) => {
  const targets = Array.isArray(args.replaceTargets)
    ? args.replaceTargets
    : [args.replaceTargets];
  return `Made template from method ${args.methodName} replacing targets: ${targets.join(", ")}`;
});

const description =
  "Lists all of the methods or functions in a file and allows you to make a template out of one of them";
const inputSchema = {
  type: "object",
  properties: {
    methodName: {
      type: "string",
      description: "Name of the method or function to create template from",
    },
    replaceTargets: {
      type: "array",
      description:
        "Target variable names to replace (comma-separated string or array)",
    },
  },
  required: ["methodName", "replaceTargets"],
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
