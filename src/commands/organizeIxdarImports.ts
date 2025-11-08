import * as input from '@/utils/vscode/input';
import * as importer from '@/utils/templating/importer';
import {
  CommandModuleImpl,
  type CommandModule
} from "@/types/command";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import * as mcp from "@/utils/ai/mcp";
import { UtilModule, UtilRegistry } from "@/utils/utilRegistry";
import * as vscode from "vscode";

/**
 * organizeIxdarImports: Looks at any unknown objects in a typescript file and if it matches one of the utils under ixdar-vs/src/utils or ixdar-vs/src/types it imports it at the top of the file with the @ symbol
 */
const commandName = "organizeIxdarImports";
const languages = ["typescript", "typescriptreact"];
const repoName = undefined;




const commandFunc = async () => {
  const editor = input.getActiveEditor();

  const document = editor.document;
  const documentUri = document.uri;

  const diagnostics = vscode.languages.getDiagnostics(documentUri);

  const unresolvedSymbols = new Set<string>();

  for (const diagnostic of diagnostics) {
    const message = diagnostic.message;
    const cannotFindMatch = message.match(/Cannot find (?:name|namespace) '([^']+)'/);
    if (cannotFindMatch) {
      unresolvedSymbols.add(cannotFindMatch[1]);
    }
  }

  if (unresolvedSymbols.size === 0) {
    vscode.window.showInformationMessage("No unresolved symbols found");
    return;
  }

  const registry = UtilRegistry.getInstance();
  const namedImportsToAdd : UtilModule[] = [];
  const existingImports = importer.parseExistingImports(document.getText());

  for (const symbolName of unresolvedSymbols) {
    const moduleMatch = registry.findModuleByName(symbolName);

    if (moduleMatch) {
      const existingPath = existingImports.namespace.get(symbolName);
      if (!existingPath ) {
        namedImportsToAdd.push(moduleMatch);
      }
      continue;
    }
  }

  if (namedImportsToAdd.length === 0) {
    vscode.window.showInformationMessage("No matching modules found in registry");
    return;
  }

  const importStatements = importer.getImportRelativeUtilModule(...namedImportsToAdd);
  if (!importStatements) {
    vscode.window.showInformationMessage("No imports to add");
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.insert(documentUri, new vscode.Position(0, 0), importStatements);

  await vscode.workspace.applyEdit(edit);

  const addedCount = namedImportsToAdd.length;
  vscode.window.showInformationMessage(`Added ${addedCount} import(s)`);
};

const mcpFunc = mcp.executeCommand(
  commandName,
  (args: any) => "Command organizeIxdarImports executed"
);

const description =
  "Looks at any unknown objects in a typescript file and if it matches one of the filenames under ixdar-vs/src/utils or ixdar-vs/src/types it imports it at the top of the file with the @ symbol";
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
