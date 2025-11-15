import * as vscode from "vscode";
import * as fs from "@/utils/vscode/fs";
import * as importer from "@/utils/templating/importer";
import { JsonRecord, deepMerge } from "@/utils/templating/json";

/**
 * @ix-module-description Use this module for all ixdar workspace operations.
 */

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
      fs.readJsonFile(ixPackageJsonUri),
      fs.readJsonFile(ixTsConfigUri),
      fs.readFile(ixGitIgnoreUri),
    ]);

  await Promise.all([
    ensureIxPackageJson(ixFolder, ixPackageJsonUri, workspacePackage),
    ensureIxTsConfig(ixFolder, ixTsConfigUri, workspaceTsConfig),
    ensureIxGitIgnore(ixFolder, ixGitIgnoreUri, workspaceGitIgnore),
  ]);

  return ixFolder;
}

export async function installIxDependencies(
  ixFolder: vscode.Uri
): Promise<void> {
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
  terminal.sendText("npm update");
  terminal.sendText("npm i; exit");

  await installComplete;
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

  if (!workspacePackage) {
    workspacePackage = await fs.readJsonFile(ixPackageJsonUri);
  }
  let desiredPackage: JsonRecord = {
    name: "ix-templates",
    private: true,
    dependencies: {
      [importer.EXTENSION_NAME]: workspaceVersion ?? "latest",
    },
    engines: {
      vscode: "^1.97.0",
    },
    devDependencies: {
      "@types/node": "^24.10.0",
      "@types/vscode": "^1.97.0",
      typescript: "^5.9.3",
    },
    scripts: {
      compile: "tsc",
    },
  } satisfies JsonRecord;

  deepMerge(desiredPackage, workspacePackage as JsonRecord);

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
  if (!workspaceTsConfig) {
    workspaceTsConfig = await fs.readJsonFile(ixTsConfigUri);
  }
  const desiredIxTsConfig = {
    compilerOptions: {
      module: "commonjs",
      moduleResolution: "node",
      target: "ES2022",
      outDir: "out",
      lib: ["ES2022"],
      types: ["vscode", "node"],
      sourceMap: true,
      declaration: true,
      baseUrl: "./src",
      paths: {
        "@/*": ["./*"],
      },
      rootDir: "src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    exclude: ["node_modules", "out", "**/*.test.ts"],
  };

  deepMerge(workspaceTsConfig as JsonRecord, desiredIxTsConfig);

  await vscode.workspace.fs.writeFile(
    ixTsConfigUri,
    Buffer.from(JSON.stringify(workspaceTsConfig, null, 2) + "\n", "utf8")
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
    desiredGitIgnore += "\nnode_modules/**\n";
  }
  if (!desiredGitIgnore.includes("npm_modules/**")) {
    desiredGitIgnore += "\nnpm_modules/**\n";
  }
  if (!desiredGitIgnore.includes("out/**")) {
    desiredGitIgnore += "\nout/**\n";
  }
  if (!desiredGitIgnore.includes(".tmp/**")) {
    desiredGitIgnore += "\n.tmp/**\n";
  }
  await vscode.workspace.fs.writeFile(
    ixGitIgnoreUri,
    Buffer.from(desiredGitIgnore, "utf8")
  );
}
