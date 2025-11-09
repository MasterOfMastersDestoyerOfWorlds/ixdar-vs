import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";

/**
 * @description Use this module for all file system operations.
 */

type JsonRecord = Record<string, unknown>;

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
  const ixFolder = await makeIxFolder(workspaceFolder);
  const templateFile = vscode.Uri.joinPath(ixFolder, fileName);
  await vscode.workspace.fs.writeFile(templateFile, Buffer.from(content));
  return templateFile;
}

/**
 * Make the .ix folder in the workspace folder.
 * @param workspaceFolder The workspace folder to make the .ix folder in.
 * @returns The URI of the .ix folder.
 */
export async function makeIxFolder(
  workspaceFolder?: vscode.WorkspaceFolder
): Promise<vscode.Uri> {
  if (!workspaceFolder) {
    workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  }
  if (!workspaceFolder) {
    throw new Error("No workspace folder found");
  }
  const ixFolder = vscode.Uri.joinPath(workspaceFolder.uri, ".ix");
  try {
    await vscode.workspace.fs.stat(ixFolder);
  } catch {
    await vscode.workspace.fs.createDirectory(ixFolder);
  }
  vscode.window.showInformationMessage("Creating ixdar workspace...");
  const ixGitIgnoreUri = vscode.Uri.joinPath(ixFolder, ".gitignore");
  const ixPackageJsonUri = vscode.Uri.joinPath(ixFolder, "package.json");
  const ixTsConfigUri = vscode.Uri.joinPath(ixFolder, "tsconfig.json");

  const [workspacePackage, workspaceTsConfig, workspaceGitIgnore] =
    await Promise.all([
      readJsonFile(ixPackageJsonUri),
      readJsonFile(ixTsConfigUri),
      readFile(ixGitIgnoreUri),
    ]);

  await Promise.all([
    ensureIxPackageJson(ixFolder, ixPackageJsonUri, workspacePackage),
    ensureIxTsConfig(ixFolder, ixTsConfigUri, workspaceTsConfig),
    ensureIxGitIgnore(ixFolder, ixGitIgnoreUri, workspaceGitIgnore),
  ]);
  const terminal = vscode.window.createTerminal({
    name: "NPM Install",
    cwd: ixFolder.fsPath,
  });

  const installComplete = new Promise<void>((resolve) => {
    const disposable = vscode.window.onDidCloseTerminal((closedTerminal) => {
      if (closedTerminal === terminal) {
        disposable.dispose();
        resolve();
      }
    });
  });

  terminal.show();
  terminal.sendText("npm i; exit");

  await installComplete;

  return ixFolder;
}

/**
 * Ensure the .ix package.json file is correct.
 * @param ixFolder The .ix folder.
 * @param ixPackageJsonUri The URI of the .ix package.json file.
 * @param workspacePackage The workspace package.json file.
 * @returns The URI of the .ix package.json file.
 */
async function ensureIxPackageJson(
  ixFolder: vscode.Uri,
  ixPackageJsonUri: vscode.Uri,
  workspacePackage: JsonRecord | undefined
): Promise<void> {
  const workspaceVersion =
    typeof workspacePackage?.version === "string"
      ? workspacePackage.version
      : undefined;
  const desiredPackage = {
    name: "ix-templates",
    private: true,
    dependencies: {
      [importer.EXTENSION_NAME]: workspaceVersion ?? "latest",
    },
  } satisfies JsonRecord;

  await vscode.workspace.fs.writeFile(
    ixPackageJsonUri,
    Buffer.from(JSON.stringify(desiredPackage, null, 2) + "\n", "utf8")
  );
}

/**
 * Ensure the .ix tsconfig.json file is correct.
 * @param ixFolder The .ix folder.
 * @param ixTsConfigUri The URI of the .ix tsconfig.json file.
 * @param workspaceTsConfig The workspace tsconfig.json file.
 * @returns The URI of the .ix tsconfig.json file.
 */
async function ensureIxTsConfig(
  ixFolder: vscode.Uri,
  ixTsConfigUri: vscode.Uri,
  workspaceTsConfig: JsonRecord | undefined
): Promise<void> {
  const rootHasConfig = Boolean(workspaceTsConfig);
  const compilerOptions =
    (workspaceTsConfig?.compilerOptions as JsonRecord | undefined) ?? {};
  const rootBaseUrl =
    typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : ".";
  const rootPaths =
    (compilerOptions.paths as Record<string, string[]> | undefined) ?? {};

  const normalizedPaths = normalizePathMappings(rootBaseUrl, rootPaths);

  const include: string[] = ["./**/*"];
  if (normalizedPaths) {
    include.push("../src/**/*");
  }

  const ixConfig: JsonRecord = {
    ...(rootHasConfig ? { extends: "../tsconfig.json" } : {}),
    compilerOptions: {
      baseUrl: "..",
      ...(normalizedPaths ? { paths: normalizedPaths } : {}),
    },
    include,
  };

  await vscode.workspace.fs.writeFile(
    ixTsConfigUri,
    Buffer.from(JSON.stringify(ixConfig, null, 2) + "\n", "utf8")
  );
}

/**
 * Ensure the .ix gitignore file is correct.
 * @param ixFolder The .ix folder.
 * @param ixGitIgnoreUri The URI of the .ix gitignore file.
 * @param workspaceGitIgnore The workspace gitignore file.
 * @returns The URI of the .ix gitignore file.
 */
async function ensureIxGitIgnore(
  ixFolder: vscode.Uri,
  ixGitIgnoreUri: vscode.Uri,
  workspaceGitIgnore: string | undefined
): Promise<void> {
  let desiredGitIgnore = workspaceGitIgnore ?? "";
  if (!desiredGitIgnore.includes("node_modules/**")) {
    desiredGitIgnore += "node_modules/**\n";
  }
  if (!desiredGitIgnore.includes("npm_modules/**")) {
    desiredGitIgnore += "npm_modules/**\n";
  }
  if (!desiredGitIgnore.includes("out/**")) {
    desiredGitIgnore += "out/**\n";
  }
  await vscode.workspace.fs.writeFile(
    ixGitIgnoreUri,
    Buffer.from(desiredGitIgnore, "utf8")
  );
}

/**
 * Read a JSON file.
 * @param uri The URI of the JSON file.
 * @returns The JSON record of the file.
 */
async function readJsonFile(uri: vscode.Uri): Promise<JsonRecord | undefined> {
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
async function readFile(uri: vscode.Uri): Promise<string | undefined> {
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
function normalizePathMappings(
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
