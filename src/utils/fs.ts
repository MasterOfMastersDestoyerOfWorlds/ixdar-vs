import * as vscode from "vscode";

export async function createTemplateFile(content: string, fileName: string, workspaceFolder?: vscode.WorkspaceFolder): Promise<vscode.Uri> {
  if (!workspaceFolder) {
    workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  }
  if (!workspaceFolder) {
    throw new Error("No workspace folder found");
  }
  const ixFolder = await makeIxFolder(workspaceFolder);
  const templateFile = vscode.Uri.joinPath(ixFolder, fileName);
  await vscode.workspace.fs.writeFile(templateFile, Buffer.from(content))
  return templateFile;
}

export async function makeIxFolder(workspaceFolder?: vscode.WorkspaceFolder): Promise<vscode.Uri> {
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
        vscode.workspace.fs.createDirectory(ixFolder);
    }
    return ixFolder;
}