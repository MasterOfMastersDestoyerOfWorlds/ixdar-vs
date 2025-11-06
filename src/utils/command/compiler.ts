import * as ts from "typescript";
import * as path from "path";

export function createCompilerHost(
  options: ts.CompilerOptions,
  moduleSearchLocations: string[]
): ts.CompilerHost {
  return {
    getSourceFile,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: (fileName, content) => ts.sys.writeFile(fileName, content),
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getDirectories: (path) => ts.sys.getDirectories(path),
    getCanonicalFileName: (fileName) =>
      ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getNewLine: () => ts.sys.newLine,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    fileExists,
    readFile,
    resolveModuleNames,
  };

  function fileExists(fileName: string): boolean {
    return ts.sys.fileExists(fileName);
  }

  function readFile(fileName: string): string | undefined {
    return ts.sys.readFile(fileName);
  }

  function getSourceFile(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void
  ) {
    const sourceText = ts.sys.readFile(fileName);
    return sourceText !== undefined
      ? ts.createSourceFile(fileName, sourceText, languageVersion)
      : undefined;
  }

  function resolveModuleNames(
    moduleNames: string[],
    containingFile: string
  ): (ts.ResolvedModule | undefined)[] {
    const resolvedModules: (ts.ResolvedModule | undefined)[] = [];
    for (const moduleName of moduleNames) {
      let result = ts.resolveModuleName(moduleName, containingFile, options, {
        fileExists,
        readFile,
      });
      if (result.resolvedModule) {
        resolvedModules.push(result.resolvedModule);
      } else {
        let resolved = false;
        for (const location of moduleSearchLocations) {
          const modulePath = path.join(location, moduleName + ".d.ts");
          if (fileExists(modulePath)) {
            resolvedModules.push({ resolvedFileName: modulePath });
            resolved = true;
            break;
          }
        }
        if (!resolved) {
          resolvedModules.push(undefined);
        }
      }
    }
    return resolvedModules;
  }
}

export function compile(
  sourceFiles: string[],
  moduleSearchLocations: string[],
  outDir: string
): ts.Program {
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    outDir: outDir,
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
    strict: false,
    types: ["node", "vscode"],
  };
  const host = createCompilerHost(options, moduleSearchLocations);
  const program = ts.createProgram(sourceFiles, options, host);
  return program;
}

export function emit(program: ts.Program) {
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
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
        );
      }
    });
  }
}
