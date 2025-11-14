import * as path from "path";
import * as fsNative from "fs";
import * as fs from "@/utils/vscode/fs";
import * as compiler from "@/utils/command/compiler";
import { CommandRegistry } from "@/utils/command/commandRegistry";
import * as ts from "typescript";
import * as vm from "vm";
import * as vscode from "vscode";

declare const __non_webpack_require__: (id: string) => any;

/**
 * @ix-module-description Dynamic command loader for workspace .ix folder. Scans, compiles, and loads 
 * custom command modules from TypeScript files in .ix directory at runtime.
 */

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

          if (
            !text.includes("@RegisterCommand") &&
            !text.includes("export default")
          ) {
            continue;
          }

          console.log(`Found potential command in ${fileUri.fsPath}`);
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
  const ixFolderPath = path.join(workspaceFolder.uri.fsPath, ".ix");
  const ixNodeModulesPath = path.join(ixFolderPath, "node_modules");
  const workspaceNodeModulesPath = path.join(
    workspaceFolder.uri.fsPath,
    "node_modules"
  );

  const modulePaths = [
    ixNodeModulesPath,
    workspaceNodeModulesPath,
    ixFolderPath,
  ];

  try {
    console.log(`Compiling ${tsFileUri.fsPath}...`);
    const outDir = path.join(ixFolderPath, "out");
    const program = compiler.compile([tsFileUri.fsPath], modulePaths, outDir);
    compiler.emit(program);

    const relativeTsPath = path.relative(ixFolderPath, tsFileUri.fsPath);
    const jsOutputPath = path
      .join(outDir, relativeTsPath)
      .replace(/\.ts$/, ".js");

    if (!fsNative.existsSync(jsOutputPath)) {
      throw new Error(`Compiled file not found at: ${jsOutputPath}`);
    }

    const compiledCode = fsNative.readFileSync(jsOutputPath, "utf8");

    const moduleObject = {
      exports: {},
      id: tsFileUri.fsPath,
      filename: tsFileUri.fsPath,
      loaded: false,
      parent: module, 
      children: [],
      paths: modulePaths,
    };

    let customRequire: any;


    customRequire = (moduleName: string) => {
      if (moduleName === "vscode") return require("vscode");

      const builtIns = [
        "fs",
        "path",
        "os",
        "crypto",
        "events",
        "stream",
        "http",
        "https",
        "url",
        "util",
        "zlib",
        "querystring",
      ];

      if (builtIns.includes(moduleName)) {
        return;
      }

      return __non_webpack_require__(moduleName);
    };

    function buildSandbox(moduleInfo: any): vm.Context {
      return vm.createContext({
        module: moduleInfo,
        exports: moduleInfo.exports,
        require: customRequire,
        __filename: moduleInfo.filename,
        __dirname: path.dirname(moduleInfo.filename),
        console,
        process,
        Buffer,
        setTimeout,
        setInterval,
        setImmediate,
        clearTimeout,
        clearInterval,
        clearImmediate,
      });
    }

    const sandbox = buildSandbox(moduleObject);
    vm.runInNewContext(compiledCode, sandbox, {
      filename: tsFileUri.fsPath, 
      displayErrors: true,
    });

    moduleObject.loaded = true;


    const registry = CommandRegistry.getInstance();

    const commandToRegister = (moduleObject.exports as any).default;

    if (commandToRegister) {
      registry.register(commandToRegister);
      console.log(
        `Successfully loaded and registered command from ${tsFileUri.fsPath}`
      );
    } else {
      console.warn(
        `Loaded ${tsFileUri.fsPath}, but no 'default' export was found to register.`
      );
    }
  } catch (error) {
    console.error(`Error loading command from ${tsFileUri.fsPath}:`, error);
    throw error;
  }
}
