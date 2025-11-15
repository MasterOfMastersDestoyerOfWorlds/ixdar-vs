import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";
import { JsonRecord } from "@/utils/templating/json";
import * as ixWorkspace from "@/utils/ixWorkspace/ixWorkspace";

/**
 * @ix-module-description Use this module for all file system operations.
 */


/**
 * File not found error class
 */
export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoFilesFoundError";
  }
}

/**
 * File already exists error class
 */
export class FileAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileAlreadyExistsError";
  }
}

/**
 * Recursively gets all files in a directory
 * @param dirUri The directory to get the files in
 * @returns a list of file URIs in the directory
 */
export async function getAllFiles(dirUri: vscode.Uri): Promise<vscode.Uri[]> {
  const files: vscode.Uri[] = [];
  const entries = await vscode.workspace.fs.readDirectory(dirUri);

  for (const [name, type] of entries) {
    const entryUri = vscode.Uri.joinPath(dirUri, name);

    if (type === vscode.FileType.Directory) {
      // Skip node_modules and other common directories
      if (
        name !== "node_modules" &&
        name !== ".git" &&
        name !== "out" &&
        name !== "dist"
      ) {
        const subFiles = await getAllFiles(entryUri);
        files.push(...subFiles);
      }
    } else if (type === vscode.FileType.File) {
      files.push(entryUri);
    }
  }

  if (files.length === 0) {
    throw new FileNotFoundError(
      `No files found in the selected folder: ${dirUri.fsPath}`
    );
  }

  return files;
}

/**
 * Create a template file in the .ix folder.
 * @param content The content of the template file.
 * @param fileName The name of the template file.
 * @param workspaceFolder The workspace folder to create the template file in.
 * @returns The URI of the created template file.
 */
export async function createTemplateFile(
  content: string,
  fileName: string,
  workspaceFolder?: vscode.WorkspaceFolder
): Promise<vscode.Uri> {
  if (!workspaceFolder) {
    workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  }
  if (!workspaceFolder) {
    throw new Error("No workspace folder found");
  }
  const ixFolder = await ixWorkspace.makeIxFolder(workspaceFolder);
  const templateFile = vscode.Uri.joinPath(ixFolder, fileName);
  await vscode.workspace.fs.writeFile(templateFile, Buffer.from(content));
  return templateFile;
}


/**
 * Read a JSON file.
 * @param uri The URI of the JSON file.
 * @returns The JSON record of the file.
 */
export async function readJsonFile(uri: vscode.Uri): Promise<JsonRecord | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");
    return JSON.parse(text) as JsonRecord;
  } catch (error) {
    return undefined;
  }
}

/**
 * Read a file.
 * @param uri The URI of the file.
 * @returns The content of the file.
 */
export async function readFile(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString("utf8");
  } catch (error) {
    return undefined;
  }
}

/**
 * Normalize path mappings.
 * @param baseUrl The base URL.
 * @param paths The paths to normalize.
 * @returns The normalized paths.
 */
export function normalizePathMappings(
  baseUrl: string,
  paths: Record<string, string[]>
): Record<string, string[]> | undefined {
  if (!Object.keys(paths).length) {
    return undefined;
  }

  const normalizedBase = strings.normalizeTsPath(baseUrl);
  return Object.fromEntries(
    Object.entries(paths).map(([alias, targets]) => {
      const remappedTargets = targets.map((target) => {
        const normalizedTarget = strings.normalizeTsPath(target);
        const joined = path.posix.normalize(
          path.posix.join(normalizedBase, normalizedTarget)
        );
        return strings.stripLeadingDot(joined);
      });
      return [alias, remappedTargets];
    })
  );
}

/**
 * Create a file.
 * @param newFileUri The URI of the new file.
 * @param template The template to create the file from.
 * @returns The URI of the created file.
 */
export async function createFile(
  newFileUri: vscode.Uri,
  template: string
): Promise<void> {
  await vscode.workspace.fs.writeFile(
    newFileUri,
    Buffer.from(template, "utf8")
  );
}

/**
 * Write content to a temporary file inside the workspace .ix folder.
 * Ensures the directory exists and avoids overwriting existing files.
 * @param fileName The desired file name for the temporary file.
 * @param content The content to write to the file.
 * @param workspaceFolder Optional workspace folder override.
 * @returns The URI of the written temporary file.
 */
export async function writeWorkspaceTempFile(
  fileName: string,
  content: string,
  workspaceFolder?: vscode.WorkspaceFolder
): Promise<vscode.Uri> {
  const ixFolder = await ixWorkspace.makeIxFolder(workspaceFolder);
  const tempDir = vscode.Uri.joinPath(ixFolder, ".tmp");
  const { name, ext } = path.parse(fileName);
  let targetUri = vscode.Uri.joinPath(tempDir, fileName);
  let suffix = 1;
  while (true) {
    try {
      await vscode.workspace.fs.stat(targetUri);
      const candidateName = `${name}-${suffix}${ext}`;
      targetUri = vscode.Uri.joinPath(tempDir, candidateName);
      suffix += 1;
    } catch {
      break;
    }
  }

  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, "utf8"));

  return targetUri;
}

/**
 * Check if a file exists.
 * @param newFileUri The URI of the file to check.
 * @returns The URI of the file.
 * @throws FileAlreadyExistsError if the file already exists.
 */
export async function checkFileExists(newFileUri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.stat(newFileUri);
    throw new FileAlreadyExistsError(
      `File for command '${newFileUri.fsPath}' already exists.`
    );
  } catch (error) {
    return;
  }
}

/**
 * Get the workspace folder.
 * @returns The workspace folder.
 * @throws FileNotFoundError if no workspace folder is found.
 */
export function getWorkspaceFolder() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new FileNotFoundError("No workspace folder found");
  }
  return workspaceFolder;
}

/**
 * Get the commands folder URI.
 * @param workspaceFolder The workspace folder.
 * @returns The URI of the commands folder.
 */
export async function getCommandsFolderUri(
  workspaceFolder: vscode.WorkspaceFolder
) {
  const commandsFolderUri = vscode.Uri.joinPath(
    workspaceFolder.uri,
    "src",
    "commands"
  );
  return commandsFolderUri;
}
