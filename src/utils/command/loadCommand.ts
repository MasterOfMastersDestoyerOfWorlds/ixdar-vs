import * as path from "path";
import * as fsNative from "fs";
import * as fs from "@/utils/vscode/fs";
import * as compiler from "@/utils/command/compiler";
import { CommandRegistry } from "@/utils/command/commandRegistry";
import * as ts from "typescript";
import * as vm from "vm";
import * as vscode from "vscode";

declare const __non_webpack_require__: (id: string) => any;
const TS_RUNTIME_EXTENSIONS = new Set([".ts", ".tsx", ".cts", ".mts"]);
const JS_PREFERRED_EXTENSIONS = [
  ".js",
  ".cjs",
  ".mjs",
  ".jsx",
  ".json",
  ".node",
];
const fallbackExtensions = [
  ...JS_PREFERRED_EXTENSIONS,
  ...Array.from(TS_RUNTIME_EXTENSIONS),
];
const indexCandidates = fallbackExtensions
  .filter((ext) => ext.length > 0)
  .map((ext) => `index${ext}`);

function resolveFileCandidate(basePath: string): string | undefined {
  const directStat = fs.safeStat(basePath);
  if (directStat?.isFile()) {
    return basePath;
  }
  const ext = path.extname(basePath);
  if (!ext) {
    for (const candidateExt of fallbackExtensions) {
      const candidatePath = `${basePath}${candidateExt}`;
      if (fs.safeStat(candidatePath)?.isFile()) {
        return candidatePath;
      }
    }
  }
  const directoryToCheck = directStat?.isDirectory() ? basePath : undefined;
  if (directoryToCheck) {
    for (const indexFile of indexCandidates) {
      const candidatePath = path.join(directoryToCheck, indexFile);
      if (fs.safeStat(candidatePath)?.isFile()) {
        return candidatePath;
      }
    }
  }
  return undefined;
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
    const emitResult = program.emit();

    if (emitResult.emitSkipped) {
      const allDiagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(emitResult.diagnostics);

      allDiagnostics.forEach((diagnostic) => {
        if (diagnostic.file) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            diagnostic.file,
            diagnostic.start!
          );
          const message = ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            "\n"
          );
          console.error(
            `${diagnostic.file.fileName} (${line + 1},${
              character + 1
            }): ${message}`
          );
        } else {
          console.error(
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
          );
        }
      });
      return;
    }
    console.log(`Successfully compiled ${tsFileUri.fsPath}.`);

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

    function resolveModulePathFallback(moduleName: string): string | undefined {
      let parsed: { packageName: string; subpath: string } | undefined;

      if (
        !moduleName ||
        moduleName.startsWith(".") ||
        moduleName.startsWith("/")
      ) {
        parsed = undefined;
      }
      const segments = moduleName.split("/");
      if (moduleName.startsWith("@")) {
        if (segments.length < 2) parsed = undefined; 
        const packageName = `${segments[0]}/${segments[1]}`;
        const subpath = segments.slice(2).join("/");
        parsed = { packageName, subpath };
      }
      const packageName = segments[0];
      const subpath = segments.slice(1).join("/");
      parsed = { packageName, subpath };

      if (!parsed) return undefined;

      for (const basePath of modulePaths) {
        try {
          const packageJsonPath = path.join(
            basePath,
            parsed.packageName,
            "package.json"
          );
          if (fs.safeStat(packageJsonPath)?.isFile()) {
            return path.dirname(packageJsonPath);
          }
        } catch {}
      }
      return undefined;
    }

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

      if (moduleName.startsWith(".")) {
        const currentDir = path.dirname(moduleObject.filename);
        const resolvedRelative = path.resolve(currentDir, moduleName);
        const fileCandidate = resolveFileCandidate(resolvedRelative);
        if (fileCandidate) {
          return __non_webpack_require__(moduleName);
        }
      }

      const packagePath = resolveModulePathFallback(moduleName);
      if (packagePath) {
        return __non_webpack_require__(moduleName);
      }

      throw new Error(
        `[ix-runtime] Cannot find module '${moduleName}'. Searched in: ${modulePaths.join(
          ", "
        )}`
      );
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
        `Successfully loaded and *registered* command from ${tsFileUri.fsPath}`
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
