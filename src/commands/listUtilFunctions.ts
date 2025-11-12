import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as fs from "@/utils/vscode/fs";
import * as utilFunctionsReport from "@/utils/command/utilFunctionsReport";
import * as commandRegistry from "@/utils/command/commandRegistry";

/**
 * listUtilFunctions: List all util functions in the registry and output them to a temporary file
 */
const commandName = "listUtilFunctions";
const languages = undefined;
const repoName = undefined;

type InputValues = Record<string, never>;
interface CommandResult {
  totalFunctions: number;
  totalModules: number;
  filePath?: string;
  content?: string;
}

const pipeline: commandModule.CommandPipeline<InputValues, CommandResult> = {
  execute: async (context) => {
    const report = utilFunctionsReport.buildUtilFunctionsReport();

    if (report.totalFunctions === 0) {
      context.addWarning("No utility functions are currently registered.");
      return {
        totalFunctions: 0,
        totalModules: 0,
      };
    }

    const timestamp = report.generatedAt.toISOString().replace(/[:.]/g, "-");
    const baseName = commandName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    const targetFileName = `${baseName}-${timestamp}.txt`;

    const tempFileUri = await fs.writeWorkspaceTempFile(
      targetFileName,
      report.content
    );

    if (context.collectFile) {
      await context.collectFile(
        tempFileUri.fsPath,
        "Util function registry listing"
      );
    }

    return {
      totalFunctions: report.totalFunctions,
      totalModules: report.totalModules,
      filePath: tempFileUri.fsPath,
      content: report.content,
    };
  },
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result || result.totalFunctions === 0) {
      return;
    }

    context.addMessage(
      `Listed ${result.totalFunctions} util functions across ${result.totalModules} modules to ${result.filePath}`
    );
  },
};

const description =
  "List all util functions in the registry and output them to a temporary file";

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

