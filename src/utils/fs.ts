import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/strings";
import * as ts from "typescript";
import * as vm from "vm";

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
      console.error(`Error scanning .ix folder in ${workspaceFolder.name}:`, error);
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
    // Read the TypeScript source file
    const content = await vscode.workspace.fs.readFile(tsFileUri);
    const sourceCode = Buffer.from(content).toString("utf8");

    console.log(`Compiling TypeScript command from: ${tsFileUri.fsPath}`);

    // Transpile TypeScript to JavaScript using the Compiler API
    const result = ts.transpileModule(sourceCode, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        resolveJsonModule: true,
        skipLibCheck: true,
        strict: false,
        sourceMap: true,
        inlineSourceMap: true,
        inlineSources: true,
      },
      fileName: tsFileUri.fsPath,
    });

    const compiledCode = result.outputText;

    // Create a module context to execute the compiled code
    const moduleExports: any = {};
    const ixFolderPath = path.join(workspaceFolder.uri.fsPath, ".ix");
    const ixNodeModulesPath = path.join(ixFolderPath, "node_modules");
    
    // Build module paths that include .ix/node_modules first
    const modulePaths = [
      ixNodeModulesPath,
      path.join(ixFolderPath, "node_modules"),
      ...(Array.isArray(module.paths) ? module.paths : []),
      path.dirname(tsFileUri.fsPath),
      ixFolderPath,
    ];

    const moduleObject = {
      exports: moduleExports,
      id: tsFileUri.fsPath,
      filename: tsFileUri.fsPath,
      loaded: false,
      parent: module,
      children: [],
      paths: modulePaths,
    };

    // Create a custom require function that can resolve modules
    const customRequire = (moduleName: string) => {
      // Handle path aliases like @/types/command, @/utils/commandRegistry
      if (moduleName.startsWith("@/")) {
        const relativePath = moduleName.replace("@/", "");
        const resolvedPath = path.join(
          workspaceFolder.uri.fsPath,
          "src",
          relativePath
        );
        
        // Try with extension, then without
        try {
          return require(resolvedPath);
        } catch {
          try {
            return require(resolvedPath + ".ts");
          } catch {
            try {
              return require(resolvedPath + ".js");
            } catch {
              // Try as directory with index
              try {
                return require(path.join(resolvedPath, "index"));
              } catch {
                console.warn(`Could not resolve module: ${moduleName}`);
                throw new Error(`Cannot find module '${moduleName}'`);
              }
            }
          }
        }
      }
      
      // For regular npm modules, use Node's module resolution with custom paths
      // This will check .ix/node_modules first, then fall back to parent paths
      try {
        const resolved = require.resolve(moduleName, { paths: modulePaths });
        return require(resolved);
      } catch (err) {
        // If module resolution fails, throw a helpful error
        throw new Error(`Cannot find module '${moduleName}'. Make sure it's installed in .ix/node_modules`);
      }
    };

    // Add properties from standard require
    customRequire.resolve = (moduleName: string, options?: any) => {
      // Try to resolve from .ix/node_modules first
      try {
        return require.resolve(moduleName, { paths: modulePaths, ...options });
      } catch (err) {
        // Try direct path resolution
        const possiblePaths = [
          path.join(ixFolderPath, "node_modules", moduleName),
          moduleName,
        ];

        for (const modulePath of possiblePaths) {
          try {
            return require.resolve(modulePath, options);
          } catch {
            continue;
          }
        }

        // Fall back to standard resolve without custom paths
        return require.resolve(moduleName, options);
      }
    };
    customRequire.cache = require.cache;
    customRequire.extensions = require.extensions;
    customRequire.main = require.main;

    // Create the sandbox context for code execution
    const sandbox = {
      module: moduleObject,
      exports: moduleExports,
      require: customRequire,
      __filename: tsFileUri.fsPath,
      __dirname: path.dirname(tsFileUri.fsPath),
      console,
      process,
      Buffer,
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
    };

    // Execute the compiled code in the sandbox
    vm.runInNewContext(compiledCode, sandbox, {
      filename: tsFileUri.fsPath,
      displayErrors: true,
    });

    // Mark module as loaded
    moduleObject.loaded = true;

    console.log(
      `Successfully compiled and loaded command module from ${tsFileUri.fsPath}`
    );
  } catch (error) {
    console.error(
      `Error compiling and loading command from ${tsFileUri.fsPath}:`,
      error
    );
    throw error;
  }
}