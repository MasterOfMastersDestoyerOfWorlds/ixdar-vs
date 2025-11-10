import { strings } from "@/index";
import { MethodInfo } from "@/types/parser";
import * as vscode from "vscode";
import { CommandQuickPickItem } from "../command/commandRegistry";

/**
 * @description Use this module for all interactions with vscode where we need to get input from the user. 
 */


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


