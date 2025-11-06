
import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import * as parser from "@/utils/templating/parser";
import * as mcp from "@/utils/ai/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as fs from "@/utils/vscode/fs";
import type Parser from "tree-sitter";

/**
 * makeTemplateFromMethod: Lists all of the methods or functions in a file and allows you to make a template out of one of them
 */
const commandName = "makeTemplateFromMethod";
const languages = undefined;
const repoName = undefined;

interface MethodInfo {
  name: string;
  node: Parser.SyntaxNode;
  text: string;
}



/**
 * Extract all methods/functions from the parse tree
 */
function extractMethods(
  tree: Parser.Tree,
  document: vscode.TextDocument,
  language: any
): MethodInfo[] {
  const queryString = parser.getMethodQuery(document.languageId);
  if (!queryString) {
    return [];
  }

  const methods: MethodInfo[] = [];
  const matches = parser.executeQuery(tree, queryString, language);

  for (const match of matches) {
    let functionNode: Parser.SyntaxNode | null = null;
    let nameNode: Parser.SyntaxNode | null = null;

    for (const capture of match.captures) {
      if (capture.name === "function") {
        functionNode = capture.node;
      } else if (capture.name === "name") {
        nameNode = capture.node;
      }
    }

    if (functionNode) {
      const text = document.getText(
        new vscode.Range(
          document.positionAt(functionNode.startIndex),
          document.positionAt(functionNode.endIndex)
        )
      );

      const name = nameNode
        ? document.getText(
            new vscode.Range(
              document.positionAt(nameNode.startIndex),
              document.positionAt(nameNode.endIndex)
            )
          )
        : `anonymous_${functionNode.startIndex}`;

      methods.push({
        name,
        node: functionNode,
        text,
      });
    }
  }

  return methods;
}

const commandFunc = async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const document = editor.document;
  const tree = parser.getParseTree(document);

  if (!tree) {
    vscode.window.showErrorMessage(
      `Tree-sitter parsing not supported for language: ${document.languageId}`
    );
    return;
  }

  const language = parser.getLanguage(document.languageId);
  if (!language) {
    vscode.window.showErrorMessage(
      `Could not get language module for: ${document.languageId}`
    );
    return;
  }

  // Extract all methods/functions
  const methods = extractMethods(tree, document, language);

  if (methods.length === 0) {
    vscode.window.showErrorMessage("No methods or functions found in this file.");
    return;
  }

  // Show quick pick to select a method
  const methodItems = methods.map((method) => ({
    label: method.name,
    description: `Line ${document.positionAt(method.node.startIndex).line + 1}`,
    method,
  }));

  const selectedItem = await vscode.window.showQuickPick(methodItems, {
    placeHolder: "Select a method or function to create a template from",
  });

  if (!selectedItem) {
    return;
  }

  let content = selectedItem.method.text;

  // Ask for target variables to replace
  const targetsInput = await vscode.window.showInputBox({
    prompt:
      "Enter target variable names (comma-separated, e.g., myMethod, myVariable)",
    placeHolder: "target1, target2, target3",
  });

  if (!targetsInput || targetsInput.length === 0) {
    return;
  }

  const methodName = selectedItem.method.name;
  const camelCaseFileName = `${strings.toCamelCase(methodName)}Template.ts`;

  let fileNameInput = await vscode.window.showInputBox({
    prompt: "Enter file name (e.g., template.ts)",
    placeHolder: `${camelCaseFileName}`,
  });

  if (!fileNameInput) {
    fileNameInput = camelCaseFileName;
  }

  const targets = targetsInput
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Replace all case variations of target variables with template literals
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

        const regex = new RegExp(`\\b${escapeRegex(variation)}\\b`, "g");
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

  vscode.window.showInformationMessage(
    `Template function created in ${templateFile.fsPath}`
  );
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const mcpFunc = mcp.executeCommand(commandName, (args: any) => {
  const targets = Array.isArray(args.replaceTargets)
    ? args.replaceTargets
    : [args.replaceTargets];
  return `Made template from method ${args.methodName} replacing targets: ${targets.join(", ")}`;
});

const description = "Lists all of the methods or functions in a file and allows you to make a template out of one of them";
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
