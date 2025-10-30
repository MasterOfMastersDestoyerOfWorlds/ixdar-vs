import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import * as strings from "@/utils/strings";
import * as mcp from "@/utils/mcp";
import { RegisterCommand } from "@/utils/commandRegistry";

const commandName = "package";
const languages = undefined;
const repoName = strings.extensionName();

const commandFunc = async () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return;
  }

  const packageJsonPath = path.join(workspaceFolder.uri.fsPath, "package.json");
  const vscodeFolderPath = path.join(workspaceFolder.uri.fsPath, ".vscode");

  try {
    // Step 1: Read and increment patch version
    vscode.window.showInformationMessage("Incrementing version...");
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    
    const versionParts = packageJson.version.split(".");
    const major = parseInt(versionParts[0] || "0", 10);
    const minor = parseInt(versionParts[1] || "0", 10);
    const patch = parseInt(versionParts[2] || "0", 10);
    
    const newVersion = `${major}.${minor}.${patch + 1}`;
    packageJson.version = newVersion;
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
    vscode.window.showInformationMessage(`Version incremented to ${newVersion}`);

    // Step 2: Create .vscode directory if it doesn't exist
    if (!fs.existsSync(vscodeFolderPath)) {
      fs.mkdirSync(vscodeFolderPath, { recursive: true });
    }

    // Step 3: Run vsce package
    vscode.window.showInformationMessage("Packaging extension...");
    const terminal = vscode.window.createTerminal({
      name: "Package Extension",
      cwd: workspaceFolder.uri.fsPath,
    });
    
    terminal.show();
    terminal.sendText(`npx @vscode/vsce package -o .vscode/`);
    
    // Wait for packaging to complete (monitor file creation)
    const vsixFileName = `${packageJson.name}-${newVersion}.vsix`;
    const vsixPath = path.join(vscodeFolderPath, vsixFileName);
    
    // Poll for file existence
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds
    
    await new Promise<void>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        attempts++;
        if (fs.existsSync(vsixPath)) {
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error("Packaging timeout - VSIX file not found"));
        }
      }, 500);
    });

    vscode.window.showInformationMessage("Package created successfully!");

    const vsixUri = vscode.Uri.file(vsixPath);
    try {
      await vscode.commands.executeCommand("workbench.extensions.action.installVsix", vsixUri);
      
      vscode.window.showInformationMessage(
        `Successfully packaged and installed ${packageJson.name} v${newVersion}. Reload window to activate.`,
        "Reload Window"
      ).then(selection => {
        if (selection === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
    } catch (installError: any) {
      vscode.window.showInformationMessage(
        `Package created at ${vsixPath}. Please install manually or reload window.`,
        "Open Folder",
        "Reload Window"
      ).then(selection => {
        if (selection === "Open Folder") {
          vscode.commands.executeCommand("revealFileInOS", vsixUri);
        } else if (selection === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
    }

  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to package extension: ${error.message}`);
    console.error("Package command error:", error);
  }
};

const mcpFunc = mcp.executeCommand(commandName, () => `Extension ${strings.extensionName()} packaged and installed`);

const description = "Increment patch version, package the extension into a VSIX file, and install it.";
const inputSchema = {
  type: "object",
  properties: {},
};

const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  mcpFunc,
  description,
  inputSchema
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
