import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/templating/strings";
import * as importer from "@/utils/templating/importer";

type JsonRecord = Record<string, unknown>;

export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoFilesFoundError";
  }
}

export class FileAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileAlreadyExistsError";
  }
}

/**
 * Recursively gets all files in a directory
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

async function readJsonFile(uri: vscode.Uri): Promise<JsonRecord | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");
    return JSON.parse(text) as JsonRecord;
  } catch (error) {
    return undefined;
  }
}

async function readFile(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString("utf8");
  } catch (error) {
    return undefined;
  }
}

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
export async function createFile(
  newFileUri: vscode.Uri,
  template: string
): Promise<void> {
  await vscode.workspace.fs.createDirectory(newFileUri);
  await vscode.workspace.fs.writeFile(
    newFileUri,
    Buffer.from(template, "utf8")
  );
}

export async function checkFileExists(newFileUri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.stat(newFileUri);
  throw new FileAlreadyExistsError(
    `File for command '${newFileUri.fsPath}' already exists.`
  );
}
export function getWorkspaceFolder() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new FileNotFoundError("No workspace folder found");
  }
  return workspaceFolder;
}

