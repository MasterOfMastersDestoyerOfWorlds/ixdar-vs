import { strings } from "@/index";
import { MethodInfo } from "@/types/parser";
import * as vscode from "vscode";
import { CommandQuickPickItem } from "../command/commandRegistry";
import { RegisterUtil } from "@/utils/utilRegistry";

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class NoActiveEditorError extends Error {
  constructor(message?: string) {
    super(message || "No active editor found.");
    this.name = "NoActiveEditorError";
  }
}

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

export function getActiveEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new NoActiveEditorError();
  }
  return editor;
}

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
export async function getCommandDescriptionInput(): Promise<string> {
  const newCommandDescription = await vscode.window.showInputBox({
    prompt: "Enter a description that we will use to build this command",
  });
  if (!newCommandDescription) {
    throw new InvalidInputError("No command description provided");
  }
  return newCommandDescription;
}

@RegisterUtil("@/utils/vscode/input", [
  { name: "InvalidInputError", kind: "class" },
  { name: "NoActiveEditorError", kind: "class" },
  { name: "getReplacementTargets", kind: "function" },
  { name: "getMethod", kind: "function" },
  { name: "getFileNameInput", kind: "function" },
  { name: "getActiveEditor", kind: "function" },
  { name: "selectCommandQuickPickItem", kind: "function" },
  { name: "getCommandNameInput", kind: "function" },
  { name: "getCommandDescriptionInput", kind: "function" },
])
class InputUtilRegistry {
  static registered = true;
}

