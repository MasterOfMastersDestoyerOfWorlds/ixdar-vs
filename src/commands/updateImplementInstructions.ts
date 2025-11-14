import * as vscode from "vscode";
import * as strings from "@/utils/templating/strings";
import * as commandModule from "@/types/command/commandModule";
import * as commandRegistry from "@/utils/command/commandRegistry";
import { CommandPipeline } from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as utilRegistry from "@/utils/utilRegistry";
import * as fs from "@/utils/vscode/fs";
import * as prompt from "@/utils/ai/prompt";
/**
 * @ix-description updateImplementInstructions: Update the implement.md instructions in .cursor/commands to reflect the current state of the code base
 */
const languages = undefined;
const repoName = undefined;

const pipeline: CommandPipeline = {
  input: () => CommandInputPlan.createInputPlan().build(),
  execute: async (context, _inputs) => {
    const registry = utilRegistry.UtilRegistry.getInstance();
    const allModules = registry.getAllModules();

    const categories: string[] = [];
    const modulesByCategory: utilRegistry.UtilModule[][] = [];

    for (const module of allModules) {
      if (!categories.includes(module.category)) {
        categories.push(module.category);
        modulesByCategory.push([]);
      }
      modulesByCategory[categories.indexOf(module.category)].push(module);
    }

    const markdown = generateImplementMarkdown(categories, modulesByCategory);

    const workspaceFolder = fs.getWorkspaceFolder();

    const workspaceRoot = workspaceFolder.uri;
    const cursorDir = vscode.Uri.joinPath(workspaceRoot, ".cursor", "commands");
    const implementPath = vscode.Uri.joinPath(cursorDir, "implement.md");

    await fs.createFile(implementPath, markdown);

    context.addMessage(
      `Updated implement.md with ${allModules.filter((m) => m.description).length} module descriptions`
    );

    return {
      modulesUpdated: allModules.filter((m) => m.description).length,
      filePath: implementPath,
    };
  },
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result) {
      return;
    }
    context.addMessage(
      `implement.md updated successfully at ${result.filePath}`
    );
  },
};

/**
 * Generate the implement.md markdown content
 */
function generateImplementMarkdown(
  categories: string[],
  modulesByCategory: utilRegistry.UtilModule[][]
): string {
  const sections: string[] = [];

  sections.push(`
# High Level Goal

Implement the command described in this file. We want a singular function that does the described behavior and self-commenting code.

${prompt.buildBestPracticesPrompt()}
${prompt.buildCommandFormatPrompt()}
# Command Format

What do we need to fill out in the command typescript file?

## commandName

Should match the name of the file

## description

Should tell us what the command does

## languages

Should tell us what languages the command is useful for, or undefined if the command does not manipulate code

## repoName

Should tell us what repo the command can be used in (likely the name of the current repo), or undefined if it is a general command for use in all repos

## inputSchema

What are the inputs, types of those inputs, and required fields when we call this from an MCP server.

## commandFunc

The main functionality of the command, should do what the description says it does

## mcpFunc

The functionality that is used when we call the command from an MCP server. Since there is no user interface, we need to know all relevant input before the function is called. We also want to return contents of any temporary file that we would have made in the command flow to the MCP server as an output so that the caller can see the results.

# Descriptions of commonly used modules

These descriptions should be available at the top of each utils module in a js-doc marked with @description. If you beleive we need a new of utility file tell me and describe it before making it.
`);
  for (const category of categories) {
    sections.push(`## ${strings.capitalize(category)}`);
    for (const module of modulesByCategory[categories.indexOf(category)]) {
      sections.push(`### ${module.name}`);
      sections.push(`${module.description}`);
    }
  }
  return sections.join("\n");
}

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
