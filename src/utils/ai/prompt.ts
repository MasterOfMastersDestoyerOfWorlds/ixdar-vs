import { McpResult } from "@/types/command/commandModule";
import * as vscode from "vscode";
import * as importer from "@/utils/templating/importer";
import * as strings from "@/utils/templating/strings";

/**
 * @ix-module-description Use this module to create outputs for the MCP server.
 */

export function buildBestPracticesPrompt(): string {
  return `
# Best Practices

- When you need to import a module use the format: import \\* as {module_name} from @/utils/{module_folder}/{module_name}
- Leave js-doc style comments at the top of a function but never in the function body
- Commands should be a single function that does the descripition, do not make other functions in a command file
- If you think that a piece of a command could be used later, find the appropiate module to add it to and export it as a function there
- Always strive for a single source of truth on a piece of code or data.
`;
}
export function buildCommandFormatPrompt() {
    return `# Command Format`
}

