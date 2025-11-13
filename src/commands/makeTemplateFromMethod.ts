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
import { CommandPipeline } from "@/types/command/commandModule";

/**
 *  @ix-description makeTemplateFromMethod: Lists all of the methods or functions in a file and allows you to make a template out of one of them
 */
const languages = undefined;
const repoName = undefined;

const pipeline: CommandPipeline = {
  input: () =>
    CommandInputPlan.createInputPlan()
      .step(inputs.selectMethodInFile())
      .step(inputs.replacementTargetsInput())
      .step(inputs.templateFileNameInput())
      .build(),
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

/**
 * Extract all methods/functions from the parse tree
 */

export const makeTemplateFromMethod = async (
  method: MethodInfo,
  targets: string[],
  fileNameInput: string
) => {
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
