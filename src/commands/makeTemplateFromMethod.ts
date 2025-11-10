
import * as vscode from "vscode";
import * as path from "path";
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import * as parser from "@/utils/templating/parser";
import * as fs from "@/utils/vscode/fs";
import { MethodInfo } from "@/types/parser";
import * as inputs from "@/utils/vscode/userInputs";

/**
 * makeTemplateFromMethod: Lists all of the methods or functions in a file and allows you to make a template out of one of them
 */
const commandName = "makeTemplateFromMethod";
const languages = undefined;
const repoName = undefined;


interface InputValues {
  method: MethodInfo;
  targets: string[];
  outputFileName: string;
}

interface CommandResult {
  filePath: string;
  methodName: string;
  targets: string[];
  outputFileName: string;
}

async function selectMethodFromDocument(
  document: vscode.TextDocument
): Promise<MethodInfo> {
  const tree = parser.getParseTree(document);
  const language = parser.getLanguage(document.languageId);
  const methods = parser.extractMethods(tree, document, language);
  return inputs.getMethod(methods);
}

const pipeline: commandModule.CommandPipeline<InputValues, CommandResult> = {
  input: () =>
    CommandInputPlan.createInputPlan<InputValues>((builder) => {
      builder.step({
        key: "method",
        schema: {
          type: "string",
          description:
            "Name of the method or function to create the template from.",
        },
        prompt: async () => {
          const editor = inputs.getActiveEditor();
          return selectMethodFromDocument(editor.document);
        },
        resolveFromArgs: async ({ args }) => {
          const filePath = args.fileToTemplate;
          const methodName = args.methodName;
          if (typeof filePath !== "string" || filePath.length === 0) {
            throw new Error("Property 'fileToTemplate' is required.");
          }
          if (typeof methodName !== "string" || methodName.length === 0) {
            throw new Error("Property 'methodName' is required.");
          }
          const document = await vscode.workspace.openTextDocument(
            vscode.Uri.file(filePath)
          );
          const tree = parser.getParseTree(document);
          const language = parser.getLanguage(document.languageId);
          const methods = parser.extractMethods(tree, document, language);
          const method =
            methods.find((candidate) => candidate.name === methodName) ??
            methods.find((candidate) =>
              candidate.name?.toLowerCase().includes(methodName.toLowerCase())
            );
          if (!method) {
            throw new Error(
              `Method '${methodName}' not found in ${filePath}.`
            );
          }
          return method;
        },
      });

      builder.step({
        key: "targets",
        schema: {
          type: "array",
          description:
            "Target variable names to replace (comma-separated string or array).",
        },
        prompt: async () => inputs.getReplacementTargets(),
        resolveFromArgs: async ({ args }) => {
          const replaceTargets = args.replaceTargets;
          if (Array.isArray(replaceTargets)) {
            return replaceTargets.map(String);
          }
          if (typeof replaceTargets === "string") {
            return replaceTargets
              .split(",")
              .map((target: string) => target.trim())
              .filter((target: string) => target.length > 0);
          }
          throw new Error(
            "Property 'replaceTargets' must be a string or array of strings."
          );
        },
      });

      builder.step({
        key: "outputFileName",
        schema: {
          type: "string",
          description: "File name for the generated template.",
        },
        prompt: async (_context, currentValues) => {
          const methodName =
            typeof currentValues.method?.name === "string"
              ? currentValues.method.name
              : "template";
          return inputs.getFileNameInput(methodName);
        },
        resolveFromArgs: async ({ args }, currentValues) => {
          if (typeof args.outputFileName === "string") {
            return args.outputFileName;
          }
          const baseName =
            typeof currentValues.method?.name === "string"
              ? currentValues.method.name
              : "template";
          return `${strings.toCamelCase(baseName)}.ts`;
        },
      });
    }),
  execute: async (context, inputs) => {
    const templateFile = await makeTemplateFromMethod(
      inputs.method,
      inputs.targets,
      inputs.outputFileName
    );

    if (context.collectFile) {
      await context.collectFile(
        templateFile.fsPath,
        `Template written to ${templateFile.fsPath}`
      );
    }

    return {
      filePath: templateFile.fsPath,
      methodName: inputs.method.name,
      targets: inputs.targets,
      outputFileName: inputs.outputFileName,
    };
  },
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result) {
      return;
    }

    context.addMessage(
      `Template generated from ${result.methodName} in ${result.filePath}.`
    );
  },
};

const description =
  "Lists all of the methods or functions in a file and allows you to make a template out of one of them";

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

