import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
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

  // Ask for file path to use as template
  const fileUri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Select Template File",
    filters: {
      'All Files': ['*']
    }
  });

  if (!fileUri || fileUri.length === 0) {
    return;
  }

  // Read the file content
  const fileContent = await vscode.workspace.fs.readFile(fileUri[0]);
  let content = Buffer.from(fileContent).toString('utf8');

  // Ask for target variables (comma-separated)
  const targetsInput = await vscode.window.showInputBox({
    prompt: "Enter target variable names (comma-separated, e.g., makeTemplateFromFile, myVariable)",
    placeHolder: "target1, target2, target3"
  });

  if (!targetsInput) {
    return;
  }

  const targets = targetsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
  
  if (targets.length === 0) {
    vscode.window.showErrorMessage("No targets specified.");
    return;
  }

  // For each target, replace all case variations with template literals
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const targetIndex = i;
    
    // Get all case variations of this target
    const caseVariations = strings.getAllCases(target);
    
    // Create a map of each case variation to its case type
    const caseMap = new Map<string, strings.StringCases>();
    caseVariations.forEach(variation => {
      const caseType = strings.getStringCase(variation);
      caseMap.set(variation, caseType);
    });

    // Sort variations by length (longest first) to avoid partial replacements
    const sortedVariations = Array.from(caseMap.keys()).sort((a, b) => b.length - a.length);

    // Replace each case variation with appropriate template literal
    for (const variation of sortedVariations) {
      const caseType = caseMap.get(variation)!;
      const functionName = strings.getFunctionForCase(caseType);
      
      if (functionName) {
        // Create template literal: ${functionName(arg0)}
        const replacement = `\${${functionName}(arg${targetIndex})}`;
        
        // Use word boundary aware replacement
        const regex = new RegExp(`\\b${escapeRegex(variation)}\\b`, 'g');
        content = content.replace(regex, replacement);
      }
    }
  }

  // Create the template function wrapper
  const argsList = targets.map((_, i) => `arg${i}`).join(', ');
  const templateFunction = `function makeTemplate(${argsList}: string) {\n  return \`${content}\`;\n}`;

  // Insert at cursor position
  editor.edit(editBuilder => {
    editBuilder.insert(editor.selection.active, templateFunction);
  });

  vscode.window.showInformationMessage(`Template function created with ${targets.length} target(s).`);
};

// Helper function to escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const mcpFunc = mcp.executeCommand(commandName, (args: any) => {
  const targets = Array.isArray(args.replaceTargets) ? args.replaceTargets : [args.replaceTargets];
  return `Made template from ${args.fileToTemplate} replacing targets: ${targets.join(', ')}`;
});

const description = "Make a template function from a file by replacing target variables with case-specific template literals.";
const inputSchema = {
  type: "object",
  properties: {
    fileToTemplate: {
      type: "string",
      description: "Path to the file to use as template"
    },
    replaceTargets: {
      type: ["string", "array"],
      description: "Target variable names to replace (comma-separated string or array)"
    }
  },
  required: ["fileToTemplate", "replaceTargets"]
};


const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  mcpFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
