
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as utilRegistry from "@/utils/utilRegistry";
import * as fs from "@/utils/vscode/fs";
import * as commandRegistry from "@/utils/command/commandRegistry";

/**
 * listUtilsModules: List all util modules in the registry and output them to a temporary file
 */
const commandName = "listUtilsModules";
const languages = undefined;
const repoName = undefined;

interface CommandResult {
  moduleCount: number;
  filePath?: string;
  content?: string;
}

const pipeline = {
  execute: async (context: commandModule.CommandRuntimeContext) => {
    const registry = utilRegistry.UtilRegistry.getInstance();
    const utilModules = registry.getAllModules();

    if (utilModules.length === 0) {
      context.addWarning("No utility modules are currently registered.");
      return { moduleCount: 0 };
    }

    const generatedAt = new Date();
    const sortedModules = [...utilModules].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const moduleLines = sortedModules.map((module, index) => {
      const location = module.filePath ? ` (${module.filePath})` : "";
      return `${index + 1}. ${module.name}${location}`;
    });

    const content = [
      "Util Registry Modules",
      `Generated: ${generatedAt.toISOString()}`,
      `Total Modules: ${sortedModules.length}`,
      "",
      ...moduleLines,
      "",
    ].join("\n");

    const timestamp = generatedAt.toISOString().replace(/[:.]/g, "-");
    const baseName = commandName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    const targetFileName = `${baseName}-${timestamp}.txt`;

    const tempFileUri = await fs.writeWorkspaceTempFile(targetFileName, content);

    if (context.collectFile) {
      await context.collectFile(tempFileUri.fsPath, "Util module listing");
    }

    return {
      moduleCount: sortedModules.length,
      filePath: tempFileUri.fsPath,
      content,
    };
  },
  cleanup: async (
    context: commandModule.CommandRuntimeContext,
    _inputs: Record<string, never>,
    result: CommandResult | undefined,
    error?: unknown
  ) => {
    if (error || !result || result.moduleCount === 0) {
      return;
    }

    context.addMessage(
      `Listed ${result.moduleCount} util modules to ${result.filePath}`
    );
  },
};

const description =
  "List all util modules in the registry and output them to a temporary file";

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl({
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
