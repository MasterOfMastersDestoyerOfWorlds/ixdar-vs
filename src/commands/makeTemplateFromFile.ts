import * as vscode from "vscode";
import * as path from "path";
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import * as commandRegistry from "@/utils/command/commandRegistry";
import * as fs from "@/utils/vscode/fs";
import * as inputs from "@/utils/vscode/userInputs";

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

interface InputValues {
  sourceFilePath?: string;
  templateContent: string;
  targets: string[];
  outputFileName: string;
}

interface CommandResult {
  filePath: string;
  targets: string[];
  outputFileName: string;
}

const pipeline: commandModule.CommandPipeline<InputValues, CommandResult> = {
  input: () =>
    CommandInputPlan.createInputPlan<InputValues>((builder) => {
      builder.step(inputs.currentFileInput());
      builder.step(inputs.activeEditorContentInput());
      builder.step(inputs.replacementTargetsInput());
      builder.step(inputs.templateFileNameInput<InputValues>());
    }),
  execute: async (context, inputs) => {
    const templateFile = await makeTemplateFromFile(
      inputs.templateContent,
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
      targets: inputs.targets,
      outputFileName: inputs.outputFileName,
    };
  },
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result) {
      return;
    }

    context.addMessage(
      `Template function created in ${result.filePath} using ${result.targets.length} targets.`
    );
  },
};

const description =
  "Make a template function from a file by replacing target variables with case-specific template literals.";

const command: commandModule.CommandModule =
  new commandModule.CommandModuleImpl<InputValues, CommandResult>({
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
