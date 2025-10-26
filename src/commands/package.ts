import * as vscode from 'vscode';

/**
 * Installs an extension from a local .vsix file.
 * @param vsixUri A Uri pointing to the .vsix file.
 */
async function installFromVsix(vsixUri: vscode.Uri) {
  try {
    // This command installs from a local file URI
    await vscode.commands.executeCommand('workbench.extensions.installVsix', vsixUri);
    
    vscode.window.showInformationMessage(`Successfully installed extension from ${vsixUri.fsPath}.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to install VSIX from ${vsixUri.fsPath}: ${error}`);
  }
}

// Example of how to use it (e.g., after a user selects a file):
export function activate(context: vscode.ExtensionContext) {
  // You would typically get this URI from a file open dialog:
  // const fileUris = await vscode.window.showOpenDialog({ ... });
  // if (fileUris && fileUris[0]) {
  //   installFromVsix(fileUris[0]);
  // }
}