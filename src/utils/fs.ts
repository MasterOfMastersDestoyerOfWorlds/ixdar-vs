import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/strings";
import * as ts from "typescript";
import * as vm from "vm";
import * as fsNative from "fs";
import { createRequire } from "module";

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

    const moduleExports: any = {};
    const ixFolderPath = path.join(workspaceFolder.uri.fsPath, ".ix");
    const ixNodeModulesPath = path.join(ixFolderPath, "node_modules");

    const modulePaths = [
      ixNodeModulesPath,
      path.join(workspaceFolder.uri.fsPath, "node_modules"),
      ixFolderPath,
      workspaceFolder.uri.fsPath,
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
    // 1. Create a new, standard Node.js require function anchored to the
    //    TypeScript file we're compiling. This is the magic key.
    //    This `ixRequire` will correctly find `.ix/node_modules`.
    const ixRequire = createRequire(moduleObject.filename);

    let customRequire: any; // Forward-declare for buildSandbox

    // 2. Refactor buildSandbox to use the new `ixRequire` for built-ins.
    //    This ensures your sandbox gets standard Node.js built-ins,
    //    not VS Code's extension host versions.
    function buildSandbox(moduleInfo: any) {
      return {
        module: moduleInfo,
        exports: moduleInfo.exports,
        require: customRequire, // Use the full customRequire (defined below)
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
        // Use ixRequire to load all built-ins for the sandbox
        path: ixRequire("path"),
        fs: ixRequire("fs"),
        url: ixRequire("url"),
        util: ixRequire("util"),
        crypto: ixRequire("crypto"),
        os: ixRequire("os"),
        events: ixRequire("events"),
        stream: ixRequire("stream"),
        http: ixRequire("http"),
        https: ixRequire("https"),
        querystring: ixRequire("querystring"),
        zlib: ixRequire("zlib"),
      };
    }
    const fallbackExtensions = [
      ...JS_PREFERRED_EXTENSIONS,
      ...Array.from(TS_RUNTIME_EXTENSIONS),
    ];
    const indexCandidates = fallbackExtensions
      .filter((ext) => ext.length > 0)
      .map((ext) => `index${ext}`);

    function safeStat(filePath: string): fsNative.Stats | undefined {
      try {
        return fsNative.statSync(filePath);
      } catch {
        return undefined;
      }
    }

    // 5. Refactor resolveModulePathFallback to use `ixRequire.resolve`
    function resolveModulePathFallback(moduleName: string): string | undefined {
      let parsed = undefined;
      if (
        !moduleName ||
        moduleName.startsWith(".") ||
        moduleName.startsWith("/")
      ) {
        return undefined;
      }

      const segments = moduleName.split("/");
      if (moduleName.startsWith("@")) {
        if (segments.length < 3) {
          return undefined;
        }
        parsed = {
          packageName: `${segments[0]}/${segments[1]}`,
          subpath: segments.slice(2).join("/"),
        };
      }

      if (segments.length < 2) {
        return undefined;
      }

      parsed = {
        packageName: segments[0],
        subpath: segments.slice(1).join("/"),
      };
      if (!parsed) {
        return undefined;
      }

      try {
        // Use ixRequire.resolve, which doesn't need the `paths` option
        const packageJsonPath = ixRequire.resolve(
          `${parsed.packageName}/package.json`
        );
        const packageRoot = path.dirname(packageJsonPath);
        const subpath = parsed.subpath;
        const normalizedSubpath = subpath.replace(/\\/g, "/");
        const candidateBase = path.join(packageRoot, normalizedSubpath);
        const directStat = safeStat(candidateBase);
        let resolve = undefined;
        if (directStat?.isFile()) {
          resolve = candidateBase;
        }

        const ext = path.extname(candidateBase);
        if (!ext) {
          for (const candidateExt of fallbackExtensions) {
            const candidatePath = `${candidateBase}${candidateExt}`;
            if (safeStat(candidatePath)?.isFile()) {
              resolve = candidatePath;
            }
          }
        }

        const directoryToCheck = directStat?.isDirectory()
          ? candidateBase
          : undefined;
        if (directoryToCheck) {
          for (const indexFile of indexCandidates) {
            const candidatePath = path.join(directoryToCheck, indexFile);
            if (safeStat(candidatePath)?.isFile()) {
              resolve = candidatePath;
            }
          }
        }
        return resolve;
      } catch {
        return undefined;
      }
    }

    // 6. Define the main `customRequire` that the sandboxed code will use.
    //    It wraps `ixRequire` and adds your TS-loading logic.
    customRequire = (moduleName: string) => {
      try {
        // First, try loading with the standard, scoped `ixRequire`.
        // This will find all modules in `.ix/node_modules` instantly.
        return ixRequire(moduleName);
      } catch (err: any) {
        // If that fails (e.g., it's a TS file), try your fallback logic
        const resolvedPath = resolveModulePathFallback(moduleName);
        if (resolvedPath) {
          const extension = path.extname(resolvedPath);
          if (TS_RUNTIME_EXTENSIONS.has(extension)) {
            const cached = dependencyModuleCache.get(resolvedPath);
            if (cached) {
              return cached;
            }

            const sourceText = fsNative.readFileSync(resolvedPath, "utf8");
            const transpiled = ts.transpileModule(sourceText, {
              // ... (your compilerOptions)
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

            // CRITICAL: The sandbox for dependencies *also* uses the
            // same `buildSandbox` rules, which gives it the same `customRequire`.
            const dependencySandbox = buildSandbox(dependencyModule);
            vm.runInNewContext(transpiled.outputText, dependencySandbox, {
              filename: resolvedPath,
              displayErrors: true,
            });

            dependencyModule.loaded = true;
            return dependencyModule.exports;
          }
          // Use our new, correctly-scoped require for plain .js files
          return ixRequire(resolvedPath);
        }
        throw new Error(
          `Cannot find module '${moduleName}'. Make sure it's installed in .ix/node_modules (Error: ${err.message})`
        );
      }
    };

    // 7. Re-implement `require.resolve` using `ixRequire.resolve`
    customRequire.resolve = (moduleName: string, options?: any) => {
      try {
        return ixRequire.resolve(moduleName, options);
      } catch (err: any) {
        const fallbackPath = resolveModulePathFallback(moduleName);
        if (fallbackPath) {
          return fallbackPath;
        }
        throw err;
      }
    };
    customRequire.cache = ixRequire.cache;
    customRequire.extensions = ixRequire.extensions;
    customRequire.main = ixRequire.main;

    const sandbox = buildSandbox(moduleObject);

    vm.runInNewContext(compiledCode, sandbox, {
      filename: tsFileUri.fsPath,
      displayErrors: true,
    });

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
