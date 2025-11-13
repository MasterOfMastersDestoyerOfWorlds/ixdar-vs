import * as parser from "@/utils/templating/parser";
import { strings } from "@/index";
import { MethodInfo } from "@/types/parser";
import * as vscode from "vscode";
import { CommandQuickPickItem } from "@/utils/command/commandRegistry";
import * as commandModule from "@/types/command/commandModule";
import type {
  InputSchemaProperty,
  VscodeInputContext,
  McpInputContext,
} from "@/types/command/commandModule";

import * as commandRegistry from "@/utils/command/commandRegistry";

/**
 * @description Use this module for all interactions with vscode where we need to get input from the user.
 */

/**
 * Factory interface for creating complete input step configurations.
 * Methods in this module return these factories for one-liner input definitions.
 */
export interface InputStepFactory<K extends string, V> {
  key: K;
  schema: InputSchemaProperty;
  required?: boolean;
  prompt: (context: VscodeInputContext, currentValues: any) => Promise<V>;
  resolveFromArgs?: (
    context: McpInputContext,
    currentValues: any
  ) => Promise<V>;
  defaultValue?: V;
}

/**
 * Invalid input error class
 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/**
 * No active editor error class
 */
export class NoActiveEditorError extends Error {
  constructor(message?: string) {
    super(message || "No active editor found.");
    this.name = "NoActiveEditorError";
  }
}

/**
 * Select a folder from the user.
 * @returns The selected folder.
 */
export async function selectFolder(): Promise<vscode.Uri[]> {
  const folderSelection = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select Folder",
    title: "Select folder to process",
  });

  if (!folderSelection || folderSelection.length === 0) {
    throw new InvalidInputError("No folder selected.");
  }
  return folderSelection;
}

/**
 * Get the replacement targets for making a template from a file from the user.
 * @returns The replacement targets.
 */
export async function getReplacementTargets(): Promise<string[]> {
  const targetsInput = await vscode.window.showInputBox({
    prompt:
      "Enter target variable names (comma-separated, e.g., myMethod, myVariable)",
    placeHolder: "target1, target2, target3",
  });

  if (!targetsInput || targetsInput.length === 0) {
    throw new InvalidInputError("No targets provided");
  }

  const targets = targetsInput
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return targets;
}

/**
 * Get a method from the user.
 * @param methods - The methods to choose from.
 * @returns The selected method.
 */
export async function getMethod(methods: MethodInfo[]): Promise<MethodInfo> {
  const methodItems = methods.map((method) => ({
    label: method.name,
    method,
  }));

  const selectedItem = await vscode.window.showQuickPick(methodItems, {
    placeHolder: "Select a method or function to create a template from",
  });

  if (!selectedItem) {
    throw new InvalidInputError("No method selected");
  }

  return selectedItem.method;
}

/**
 * Get a file name from the user.
 * @param fileName - The file name to use as a placeholder.
 * @returns The selected file name.
 */
export async function getFileNameInput(fileName: string): Promise<string> {
  const camelCaseFileName = `${strings.toCamelCase(fileName)}.ts`;

  let fileNameInput = await vscode.window.showInputBox({
    prompt: "Enter file name (e.g., template.ts)",
    placeHolder: `${camelCaseFileName}`,
  });

  if (!fileNameInput) {
    fileNameInput = camelCaseFileName;
  }
  return fileNameInput;
}

/**
 * Get the active editor.
 * @returns The active editor.
 */
export function getActiveEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new NoActiveEditorError();
  }
  return editor;
}

/**
 * Select a command from the user.
 * @param items - The commands to choose from.
 * @returns The selected command.
 */
export async function selectCommandQuickPickItem(
  items: CommandQuickPickItem[]
): Promise<CommandQuickPickItem> {
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a command to execute",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    throw new InvalidInputError("No command selected");
  }
  return selected;
}

/**
 * Get a command name from the user.
 * @returns The selected command name.
 */
export async function getCommandNameInput(): Promise<string> {
  const newCommandName = await vscode.window.showInputBox({
    prompt: "Enter a name for your new command (e.g. myNewCommand):",
    validateInput: (value) => {
      if (!value || !strings.isValidIdentifier(value)) {
        return "Please enter a valid TypeScript identifier.";
      }
      return null;
    },
  });
  if (!newCommandName) {
    throw new InvalidInputError("No command name provided");
  }
  return newCommandName;
}

/**
 * Get a command description from the user.
 * @returns The selected command description.
 */
export async function getCommandDescriptionInput(): Promise<string> {
  const newCommandDescription = await vscode.window.showInputBox({
    prompt: "Enter a description that we will use to build this command",
  });
  if (!newCommandDescription) {
    throw new InvalidInputError("No command description provided");
  }
  return newCommandDescription;
}

// ============================================================================
// INPUT STEP FACTORIES
// ============================================================================

/**
 * Factory for folder selection input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function folderInput<K extends string = "folderUri">(options?: {
  key?: K;
  argNames?: string[];
}): InputStepFactory<K, vscode.Uri> {
  const key = (options?.key ?? "folderUri") as K;
  const argNames = options?.argNames ?? ["folderPath", "folder"];

  return {
    key,
    schema: {
      type: "string",
      description: "Absolute path to the folder to process",
    },
    prompt: async () => {
      const folderSelection = await selectFolder();
      return folderSelection[0];
    },
    resolveFromArgs: async ({ args }) => {
      const folderPath = argNames
        .map((name) => args[name])
        .find((val) => typeof val === "string" && val.length > 0) as
        | string
        | undefined;

      if (!folderPath) {
        throw new Error(`Property '${argNames[0]}' is required.`);
      }

      const folderUri = vscode.Uri.file(folderPath);
      try {
        await vscode.workspace.fs.stat(folderUri);
      } catch {
        throw new Error(`Folder not found: ${folderPath}`);
      }
      return folderUri;
    },
  };
}

/**
 * Factory for command selection input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function commandInput<K extends string = "commandId">(options?: {
  key?: K;
  argNames?: string[];
  getAllCommands?: () => Promise<CommandQuickPickItem[]>;
}): InputStepFactory<K, commandModule.CommandModule> {
  const key = (options?.key ?? "commandId") as K;
  const argNames = options?.argNames ?? ["commandName", "commandId", "command"];

  return {
    key,
    schema: {
      type: "string",
      description:
        "Name or ID of the command to execute (e.g. 'removeAllComments' or 'editor.action.formatDocument')",
    },
    prompt: async () => {
      if (!options?.getAllCommands) {
        options!.getAllCommands = () =>
          commandRegistry.getAllCommandQuickPickItems();
      }
      const allCommands = await options!.getAllCommands();
      const selected = await selectCommandQuickPickItem(allCommands);
      return selected.commandModule;
    },
    resolveFromArgs: async ({ args }) => {
      const targetCommandName = argNames
        .map((name) => args[name])
        .find((val) => typeof val === "string" && val.length > 0) as
        | string
        | undefined;

      if (!targetCommandName) {
        throw new Error(`Property '${argNames[0]}' is required.`);
      }
      const registry = commandRegistry.CommandRegistry.getInstance();
      const allCommands = registry.getAllMcpCommands();

      const targetCommand = allCommands.find(
        (cmd) =>
          cmd.vscodeCommand.id === targetCommandName ||
          cmd.vscodeCommand.id.endsWith(`.${targetCommandName}`) ||
          cmd.name === targetCommandName
      );

      if (targetCommand) {
        return targetCommand;
      }

      throw new Error(
        `Command '${targetCommandName}' not found in MCP registry. Only MCP commands are supported.`
      );
    },
  };
}

/**
 * Factory for replacement targets input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function replacementTargetsInput<K extends string = "targets">(options?: {
  key?: K;
  argName?: string;
}): InputStepFactory<K, string[]> {
  const key = (options?.key ?? "targets") as K;
  const argName = options?.argName ?? "replaceTargets";

  return {
    key,
    schema: {
      type: "array",
      description:
        "Target variable names to replace (comma-separated string or array).",
      items: { type: "string" },
    },
    prompt: async () => {
      return await getReplacementTargets();
    },
    resolveFromArgs: async ({ args }) => {
      const replaceTargets = args[argName];
      if (Array.isArray(replaceTargets)) {
        return replaceTargets.map(String);
      }
      if (typeof replaceTargets === "string") {
        return replaceTargets
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      }
      throw new Error(`Property '${argName}' must be a string or array.`);
    },
  };
}

/**
 * Factory for file name input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function fileNameInput<K extends string = "fileName">(options?: {
  key?: K;
  argName?: string;
  defaultFileName?: string;
}): InputStepFactory<K, string> {
  const key = (options?.key ?? "fileName") as K;
  const argName = options?.argName ?? "fileName";

  return {
    key,
    schema: {
      type: "string",
      description: "Name of the file (e.g., template.ts)",
    },
    prompt: async (_, currentValues: any) => {
      const baseFileName =
        options?.defaultFileName ?? currentValues.fileName ?? "file";
      return await getFileNameInput(baseFileName);
    },
    resolveFromArgs: async ({ args }) => {
      const fileName = args[argName];
      if (typeof fileName !== "string" || fileName.length === 0) {
        if (options?.defaultFileName) {
          return options.defaultFileName;
        }
        throw new Error(`Property '${argName}' is required.`);
      }
      return fileName;
    },
  };
}

/**
 * Factory for command name input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function commandNameInput<K extends string = "newCommandName">(options?: {
  key?: K;
  argName?: string;
}): InputStepFactory<K, string> {
  const key = (options?.key ?? "newCommandName") as K;
  const argName = options?.argName ?? "newCommandName";

  return {
    key,
    schema: {
      type: "string",
      description: "The name of the new command to create.",
    },
    prompt: async () => {
      return await getCommandNameInput();
    },
    resolveFromArgs: async ({ args }) => {
      const value = args[argName];
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Property '${argName}' is required.`);
      }
      return value;
    },
  };
}

/**
 * Factory for command description input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function commandDescriptionInput<K extends string = "description">(options?: {
  key?: K;
  argName?: string;
  required?: boolean;
  defaultValue?: string;
}): InputStepFactory<K, string> {
  const key = (options?.key ?? "description") as K;
  const argName = options?.argName ?? "description";
  const required = options?.required ?? false;
  const defaultValue = options?.defaultValue ?? "";

  return {
    key,
    schema: {
      type: "string",
      description: "Description of what the command should do.",
    },
    required,
    defaultValue,
    prompt: async () => {
      if (!required) {
        const description = await vscode.window.showInputBox({
          prompt: "Enter a description (optional)",
        });
        return description || defaultValue;
      }
      return await getCommandDescriptionInput();
    },
    resolveFromArgs: async ({ args }) => {
      const value = args[argName];
      if (typeof value === "string") {
        return value;
      }
      if (!required) {
        return defaultValue;
      }
      throw new Error(`Property '${argName}' is required.`);
    },
  };
}

/**
 * Factory for active editor content input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function activeEditorContentInput<K extends string = "content">(options?: {
  key?: K;
  filePathArgName?: string;
}): InputStepFactory<K, string> {
  const key = (options?.key ?? "content") as K;
  const filePathArgName = options?.filePathArgName ?? "filePath";

  return {
    key,
    schema: {
      type: "string",
      description: "Content of the file to process.",
    },
    prompt: async () => {
      const editor = getActiveEditor();
      return editor.document.getText();
    },
    resolveFromArgs: async ({ args }, currentValues: any) => {
      const filePath = (args[filePathArgName] ?? currentValues.filePath) as
        | string
        | undefined;
      if (!filePath || typeof filePath !== "string") {
        throw new Error(`Property '${filePathArgName}' is required.`);
      }
      const fileUri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(fileUri);
      return Buffer.from(content).toString("utf8");
    },
  };
}

/**
 * Factory for method selection input step.
 * @param options - Configuration options for the step.
 * @returns Complete input step configuration.
 */
export function methodInput<K extends string = "method">(options: {
  key?: K;
  argName?: string;
  getMethods: () => Promise<MethodInfo[]>;
}): InputStepFactory<K, MethodInfo> {
  const key = (options.key ?? "method") as K;
  const argName = options.argName ?? "methodName";

  return {
    key,
    schema: {
      type: "string",
      description: "Name of the method to select.",
    },
    prompt: async () => {
      const methods = await options.getMethods();
      return await getMethod(methods);
    },
    resolveFromArgs: async ({ args }) => {
      const methodName = args[argName];
      if (typeof methodName !== "string" || methodName.length === 0) {
        throw new Error(`Property '${argName}' is required.`);
      }
      const methods = await options.getMethods();
      const method = methods.find((m) => m.name === methodName);
      if (!method) {
        throw new Error(`Method not found: ${methodName}`);
      }
      return method;
    },
  };
}

export function templateFileNameInput(): InputStepFactory<"outputFileName", string> {
  return {
    key: "outputFileName" as const,
    schema: {
      type: "string",
      description: "File name for the generated template.",
    },
    prompt: async (
      _context: commandModule.VscodeInputContext,
      currentValues: any
    ) => {
      const methodName =
        typeof currentValues.method?.name === "string"
          ? currentValues.method.name
          : "template";
      return await getFileNameInput(methodName);
    },
    resolveFromArgs: async (
      { args }: commandModule.McpInputContext,
      currentValues: any
    ) => {
      if (typeof args.outputFileName === "string") {
        return args.outputFileName;
      }
      const baseName =
        typeof currentValues.method?.name === "string"
          ? currentValues.method.name
          : "template";
      return `${strings.toCamelCase(baseName)}.ts`;
    },
  };
}

export function currentFileInput(): InputStepFactory<"sourceFilePath", string> {
  return {
    key: "sourceFilePath" as const,
    schema: {
      type: "string",
      description:
        "Path to the file used to create the template (required for MCP).",
    },
    required: false,
    prompt: async () => {
      const editor = getActiveEditor();
      return editor.document.fileName;
    },
    resolveFromArgs: async ({ args }: commandModule.McpInputContext) => {
      if (typeof args.fileToTemplate !== "string") {
        throw new Error("Property 'fileToTemplate' is required.");
      }
      return args.fileToTemplate;
    },
  };
}
export function commandArgsInput(): InputStepFactory<"args", Record<string, unknown>> {
  return {
    key: "args" as const,
    schema: {
      type: "object",
      description:
        "Optional arguments to pass to the command being executed (MCP only).",
    },
    required: false,
    defaultValue: {},
    prompt: async () => ({}),
    resolveFromArgs: async ({ args }: commandModule.McpInputContext) => {
      const provided = args.args;
      if (provided && typeof provided === "object") {
        return provided as Record<string, unknown>;
      }
      return {};
    },
  };
}
export function selectMethodInFile(): InputStepFactory<"method", MethodInfo> {
  return {
    key: "method" as const,
    schema: {
      type: "string",
      description:
        "Name of the method or function to create the template from.",
    },
    prompt: async () => {
      const editor = getActiveEditor();
      return parser.selectMethodFromDocument(editor.document);
    },
    resolveFromArgs: async ({ args }: commandModule.McpInputContext) => {
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
        throw new Error(`Method '${methodName}' not found in ${filePath}.`);
      }
      return method;
    },
  };
}
