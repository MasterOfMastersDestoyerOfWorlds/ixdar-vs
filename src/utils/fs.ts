import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/strings";
import * as ts from "typescript";
import * as vm from "vm";
import * as fsNative from "fs";
import * as compiler from "@/utils/compiler";
import { CommandRegistry } from "@/utils/commandRegistry";
declare const __non_webpack_require__: (id: string) => any;
// --- Module Loading Constants & Helpers ---

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

type JsonRecord = Record<string, unknown>;

function parsePackageRequest(
  request: string
): { packageName: string; subpath: string } | undefined {
  if (!request || request.startsWith(".") || request.startsWith("/")) {
    return undefined;
  }
  const segments = request.split("/");
  if (request.startsWith("@")) {
    if (segments.length < 2) return undefined; // e.g. @scope (incomplete)
    const packageName = `${segments[0]}/${segments[1]}`;
    const subpath = segments.slice(2).join("/");
    return { packageName, subpath };
  }
  const packageName = segments[0];
  const subpath = segments.slice(1).join("/");
  return { packageName, subpath };
}

function safeStat(filePath: string): fsNative.Stats | undefined {
  try {
    return fsNative.statSync(filePath);
  } catch {
    return undefined;
  }
}

function resolveFileCandidate(basePath: string): string | undefined {
  const directStat = safeStat(basePath);
  if (directStat?.isFile()) {
    return basePath;
  }
  const ext = path.extname(basePath);
  if (!ext) {
    for (const candidateExt of fallbackExtensions) {
      const candidatePath = `${basePath}${candidateExt}`;
      if (safeStat(candidatePath)?.isFile()) {
        return candidatePath;
      }
    }
  }
  const directoryToCheck = directStat?.isDirectory() ? basePath : undefined;
  if (directoryToCheck) {
    for (const indexFile of indexCandidates) {
      const candidatePath = path.join(directoryToCheck, indexFile);
      if (safeStat(candidatePath)?.isFile()) {
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

// --- Original Functions (createTemplateFile, makeIxFolder, etc.) ---

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

// --- Main Command Loading Logic ---

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

    // 7. Manual loader for .js and .ts files
    function loadModuleFromResolvedPath(resolvedPath: string): any {
      const extension = path.extname(resolvedPath);
      if (TS_RUNTIME_EXTENSIONS.has(extension)) {
        return loadTypeScriptDependency(resolvedPath);
      }
      // Use the host's require for .js, .json, .node
      return __non_webpack_require__(resolvedPath);
    }

    // 8. Manual path resolver (no require.resolve)
    function resolveModulePathFallback(moduleName: string): string | undefined {
      const parsed = parsePackageRequest(moduleName);
      if (!parsed) return undefined;

      for (const basePath of modulePaths) {
        try {
          const packageJsonPath = path.join(
            basePath,
            parsed.packageName,
            "package.json"
          );
          if (safeStat(packageJsonPath)?.isFile()) {
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
        return __non_webpack_require__(moduleName);
      }

      // Handle relative paths
      if (moduleName.startsWith(".")) {
        const currentDir = path.dirname(moduleObject.filename);
        const resolvedRelative = path.resolve(currentDir, moduleName);
        const fileCandidate = resolveFileCandidate(resolvedRelative);
        if (fileCandidate) {
          return loadModuleFromResolvedPath(fileCandidate);
        }
      }
      
      const packagePath = resolveModulePathFallback(moduleName);
      if (packagePath) {
        return loadModuleFromResolvedPath(packagePath);
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
