import * as vscode from "vscode";
import * as fsNative from "fs";
import * as path from "path";
import { CommandModuleImpl, type CommandModule } from "@/types/commandModule";
import * as importer from "@/utils/templating/importer";
import * as mcp from "@/utils/ai/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as fs from "@/utils/vscode/fs";

const commandName = "package";
const languages = undefined;
const repoName = importer.EXTENSION_NAME;

const commandFunc = async () => {
  const workspaceFolder = await fs.getWorkspaceFolder();
  const packageJsonPath = path.join(workspaceFolder.uri.fsPath, "package.json");
  const vscodeFolderPath = path.join(workspaceFolder.uri.fsPath, ".vscode");

  try {
    vscode.window.showInformationMessage("Incrementing version...");
    const packageJsonContent = fsNative.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    
    const versionParts = packageJson.version.split(".");
    const major = parseInt(versionParts[0] || "0", 10);
    const minor = parseInt(versionParts[1] || "0", 10);
    const patch = parseInt(versionParts[2] || "0", 10);
    
    const newVersion = `${major}.${minor}.${patch + 1}`;
    packageJson.version = newVersion;
    
    fsNative.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
    vscode.window.showInformationMessage(`Version incremented to ${newVersion}`);

    if (!fsNative.existsSync(vscodeFolderPath)) {
      fsNative.mkdirSync(vscodeFolderPath, { recursive: true });
    }

    vscode.window.showInformationMessage("Packaging extension...");
    const terminal = vscode.window.createTerminal({
      name: "Package Extension",
      cwd: workspaceFolder.uri.fsPath,
    });
    
    terminal.show();
    terminal.sendText(`npx @vscode/vsce package -o .vscode/`);
    
    const vsixFileName = `${packageJson.name}-${newVersion}.vsix`;
    const vsixPath = path.join(vscodeFolderPath, vsixFileName);
    
    let attempts = 0;
    const maxAttempts = 60; 
    
    await new Promise<void>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        attempts++;
        if (fsNative.existsSync(vsixPath)) {
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error("Packaging timeout - VSIX file not found"));
        }
      }, 500);
    });
    
    terminal.sendText(`npx @vscode/vsce package -i .vscode/${importer.EXTENSION_NAME}-${newVersion}.vsix`);
    terminal.sendText("npm publish ./lib --access public");

    vscode.window.showInformationMessage("Package created successfully!");

    const vsixUri = vscode.Uri.file(vsixPath);
    try {
      await vscode.commands.executeCommand("workbench.extensions.action.installVSIX", [vsixUri]);
      
      vscode.window.showInformationMessage(
        `Successfully packaged and installed ${packageJson.name} v${newVersion}. Reload window to activate.`,
        "Reload Window"
      ).then(selection => {
        if (selection === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
    } catch (installError: any) {
      vscode.window.showErrorMessage(
        `Package created at ${vsixPath}. Error installing: ${installError.message}`,
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

const mcpFunc = mcp.executeCommand(commandName, () => `Extension ${importer.EXTENSION_NAME} packaged and installed`);

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
  description,
  inputSchema,
  mcpFunc
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
