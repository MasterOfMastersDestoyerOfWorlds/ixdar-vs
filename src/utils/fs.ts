import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/strings";
import * as compiler from "@/utils/compiler";
const TS_RUNTIME_EXTENSIONS = new Set([".ts", ".tsx", ".cts", ".mts"]);
const JS_PREFERRED_EXTENSIONS = [
  ".js",
  ".cjs",
  ".mjs",
  ".jsx",
  ".json",
  ".node",
];

const dependencyModuleCache = new Map<string, any>();

type JsonRecord = Record<string, unknown>;

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
      "ixdar-vs": workspaceVersion ?? "latest",
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

/**
 * Loads command modules from the .ix folder in the workspace.
 * Scans for TypeScript files with @RegisterCommand annotation and dynamically imports them.
 */
export async function loadWorkspaceCommands(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log("No workspace folder found, skipping .ix command loading");
    return;
  }

  for (const workspaceFolder of workspaceFolders) {
    const ixFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, ".ix");

    try {
      await vscode.workspace.fs.stat(ixFolderUri);
    } catch {
      console.log(`No .ix folder found in ${workspaceFolder.name}, skipping`);
      continue;
    }

    console.log(`Scanning .ix folder in ${workspaceFolder.name} for commands`);

    try {
      const files = await findTypeScriptFiles(ixFolderUri);
      console.log(`Found ${files.length} TypeScript files in .ix folder`);

      for (const fileUri of files) {
        try {
          const content = await vscode.workspace.fs.readFile(fileUri);
          const text = Buffer.from(content).toString("utf8");

          if (!text.includes("@RegisterCommand")) {
            continue;
          }

          console.log(`Found @RegisterCommand in ${fileUri.fsPath}`);
          await loadCompiledCommand(fileUri, workspaceFolder);
        } catch (error) {
          console.error(`Error loading command from ${fileUri.fsPath}:`, error);
        }
      }
    } catch (error) {
      console.error(
        `Error scanning .ix folder in ${workspaceFolder.name}:`,
        error
      );
    }
  }
}

/**
 * Recursively finds all TypeScript files in a directory
 */
async function findTypeScriptFiles(dirUri: vscode.Uri): Promise<vscode.Uri[]> {
  const results: vscode.Uri[] = [];

  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);

    for (const [name, type] of entries) {
      if (name === "node_modules" || name.startsWith(".")) {
        continue;
      }

      const entryUri = vscode.Uri.joinPath(dirUri, name);

      if (type === vscode.FileType.Directory) {
        const subResults = await findTypeScriptFiles(entryUri);
        results.push(...subResults);
      } else if (type === vscode.FileType.File && name.endsWith(".ts")) {
        results.push(entryUri);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirUri.fsPath}:`, error);
  }

  return results;
}

/**
 * Compiles and loads a TypeScript command module from the .ix folder on the fly
 * using the TypeScript Compiler API
 */
async function loadCompiledCommand(
  tsFileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
  try {
    const content = await vscode.workspace.fs.readFile(tsFileUri);
    const sourceCode = Buffer.from(content).toString("utf8");

    console.log(`Compiling TypeScript command from: ${tsFileUri.fsPath}`);

    const ixFolderPath = path.join(workspaceFolder.uri.fsPath, ".ix");
    const ixNodeModulesPath = path.join(ixFolderPath, "node_modules");

    const modulePaths = [ixNodeModulesPath, ixFolderPath];
    const program = compiler.compile([tsFileUri.fsPath], modulePaths);
    const emitResult = program.emit();
    if (emitResult.emitSkipped) {
      console.error(`Error emitting TypeScript command from ${tsFileUri.fsPath}:`, emitResult.diagnostics);
      return;
    }
  } catch (error) {
    console.error(
      `Error compiling TypeScript command from ${tsFileUri.fsPath}:`,
      error
    );
  }
}
