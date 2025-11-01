import * as path from "path";
import * as vscode from "vscode";
import * as strings from "@/utils/strings";

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
  const [workspacePackage, workspaceTsConfig] = await Promise.all([
    readJsonFile(vscode.Uri.joinPath(workspaceFolder.uri, "package.json")),
    readJsonFile(vscode.Uri.joinPath(workspaceFolder.uri, "tsconfig.json")),
  ]);

  await Promise.all([
    ensureIxPackageJson(ixFolder, workspacePackage),
    ensureIxTsConfig(ixFolder, workspaceTsConfig),
  ]);
  return ixFolder;
}

async function ensureIxPackageJson(
  ixFolder: vscode.Uri,
  workspacePackage: JsonRecord | undefined
): Promise<void> {
  const ixPackageUri = vscode.Uri.joinPath(ixFolder, "package.json");

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
    ixPackageUri,
    Buffer.from(JSON.stringify(desiredPackage, null, 2) + "\n", "utf8")
  );
}

async function ensureIxTsConfig(
  ixFolder: vscode.Uri,
  workspaceTsConfig: JsonRecord | undefined
): Promise<void> {
  const ixTsConfigUri = vscode.Uri.joinPath(ixFolder, "tsconfig.json");

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

async function readJsonFile(uri: vscode.Uri): Promise<JsonRecord | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");
    return JSON.parse(text) as JsonRecord;
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

