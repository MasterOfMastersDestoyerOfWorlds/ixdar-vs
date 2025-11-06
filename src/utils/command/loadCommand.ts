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
const dependencyModuleCache = new Map<string, any>();
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

function resolveModulePathFromPackage(
  packageRoot: string,
  subpath: string
): string | undefined {
  // If subpath is empty, try to resolve package "main"
  if (!subpath) {
    try {
      const packageJson = JSON.parse(
        fsNative.readFileSync(path.join(packageRoot, "package.json"), "utf8")
      );
      if (packageJson.main) {
        const mainPath = path.resolve(packageRoot, packageJson.main);
        const resolved = resolveFileCandidate(mainPath);
        if (resolved) return resolved;
      }
    } catch {}
    // Fallback to index
    const indexResolved = resolveFileCandidate(path.join(packageRoot, "index"));
    if (indexResolved) return indexResolved;
  }

  // Resolve subpath
  const candidateBase = path.join(packageRoot, subpath);
  const resolved = resolveFileCandidate(candidateBase);
  if (resolved) {
    return resolved;
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

          // We'll check for @RegisterCommand just to be efficient,
          // but the actual registration happens via `export default`.
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

  // 1. Define all module paths
  const modulePaths = [
    ixNodeModulesPath,
    workspaceNodeModulesPath,
    ixFolderPath,
  ];

  try {
    // 2. Compile the program
    console.log(`Compiling ${tsFileUri.fsPath}...`);
    const outDir = path.join(ixFolderPath, "out");
    const program = compiler.compile([tsFileUri.fsPath], modulePaths, outDir);
    const emitResult = program.emit();

    if (emitResult.emitSkipped) {
      // Log full diagnostics
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

    // 3. Find the *output* .js file
    // e.g., ".ix/myCommand.ts" -> ".ix/out/myCommand.js"
    const relativeTsPath = path.relative(ixFolderPath, tsFileUri.fsPath);
    const jsOutputPath = path
      .join(outDir, relativeTsPath)
      .replace(/\.ts$/, ".js");

    if (!fsNative.existsSync(jsOutputPath)) {
      throw new Error(`Compiled file not found at: ${jsOutputPath}`);
    }

    // 4. Read the compiled JavaScript
    const compiledCode = fsNative.readFileSync(jsOutputPath, "utf8");

    // 5. --- THIS IS THE SANDBOX YOU NEED ---
    const moduleObject = {
      exports: {},
      id: tsFileUri.fsPath,
      filename: tsFileUri.fsPath,
      loaded: false,
      parent: module, // The 'module' object provided by VS Code host
      children: [],
      paths: modulePaths,
    };

    let customRequire: any; // Forward declare for sandbox

    // 6. Manual function to load .ts dependencies
    function loadTypeScriptDependency(resolvedPath: string): any {
      const cached = dependencyModuleCache.get(resolvedPath);
      if (cached) return cached;

      const sourceText = fsNative.readFileSync(resolvedPath, "utf8");

      // We must transpile dependencies, not compile them
      const transpiled = ts.transpileModule(sourceText, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          moduleResolution: ts.ModuleResolutionKind.NodeJs,
        },
        fileName: resolvedPath,
      });

      const dependencyModule = {
        exports: {},
        id: resolvedPath,
        filename: resolvedPath,
        loaded: false,
        parent: moduleObject,
        children: [],
        paths: modulePaths,
      };
      dependencyModuleCache.set(resolvedPath, dependencyModule.exports);

      const dependencySandbox = buildSandbox(dependencyModule);
      vm.runInNewContext(transpiled.outputText, dependencySandbox, {
        filename: resolvedPath,
        displayErrors: true,
      });
      dependencyModule.loaded = true;
      return dependencyModule.exports;
    }

    // 8. Manual path resolver (no require.resolve)
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
        if (segments.length < 2) parsed = undefined; // e.g. @scope (incomplete)
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
      // "vscode" is special, it's provided by the host. Use the webpack 'require'.
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

      // --- FIX ---
      // Use `module.require` to get the *real* Node.js built-in modules,
      // not the Webpack-bundled "empty" ones.
      if (builtIns.includes(moduleName)) {
        return;
      }

      // Handle relative paths
      if (moduleName.startsWith(".")) {
        const currentDir = path.dirname(moduleObject.filename);
        const resolvedRelative = path.resolve(currentDir, moduleName);
        const fileCandidate = resolveFileCandidate(resolvedRelative);
        if (fileCandidate) {
          return __non_webpack_require__(moduleName);
        }
      }

      if (moduleName.startsWith("@")) {
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

    // 10. The sandbox builder
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

    // 11. Create the sandbox and run the code!
    const sandbox = buildSandbox(moduleObject);
    vm.runInNewContext(compiledCode, sandbox, {
      filename: tsFileUri.fsPath, // Use the *original* .ts path for error reporting
      displayErrors: true,
    });

    moduleObject.loaded = true;

    // --- Parent-Side Registration ("Faking it") ---

    // 1. Get the parent's "real" registry
    const registry = CommandRegistry.getInstance();

    // 2. Check the child's exports for the command
    const commandToRegister = (moduleObject.exports as any).default;

    // 3. Register it from the parent
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
    // --- End of Registration ---
  } catch (error) {
    console.error(`Error loading command from ${tsFileUri.fsPath}:`, error);
    throw error;
  }
}
