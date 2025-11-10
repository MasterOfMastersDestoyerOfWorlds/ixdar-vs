import * as input from "@/utils/vscode/userInputs";
import * as importer from "@/utils/templating/importer";
import * as commandModule from "@/types/command/commandModule";
import * as CommandInputPlan from "@/types/command/CommandInputPlan";
import * as commandRegistry from "@/utils/command/commandRegistry";
import { UtilModule, UtilRegistry } from "@/utils/utilRegistry";
import * as vscode from "vscode";

/**
 * organizeIxdarImports: Looks at any unknown objects in a typescript file and if it matches one of the utils under ixdar-vs/src/utils or ixdar-vs/src/types it imports it at the top of the file with the @ symbol
 */
const commandName = "organizeIxdarImports";
const languages = ["typescript", "typescriptreact"];
const repoName = undefined;




type InputValues = Record<string, never>;
interface CommandResult {
  addedImports: number;
  missingSymbols: string[];
}

const pipeline: commandModule.CommandPipeline<InputValues, CommandResult> = {
  input: () => CommandInputPlan.createInputPlan<InputValues>(() => {}),
  execute: async (context) => {
    const editor = input.getActiveEditor();

    const document = editor.document;
    const documentUri = document.uri;

    const diagnostics = vscode.languages.getDiagnostics(documentUri);

    const unresolvedSymbols = new Set<string>();

    for (const diagnostic of diagnostics) {
      const message = diagnostic.message;
      const cannotFindMatch = message.match(
        /Cannot find (?:name|namespace) '([^']+)'/
      );
      if (cannotFindMatch) {
        unresolvedSymbols.add(cannotFindMatch[1]);
      }
    }

    if (unresolvedSymbols.size === 0) {
      context.addWarning("No unresolved symbols found.");
      return { addedImports: 0, missingSymbols: [] };
    }

    const registry = UtilRegistry.getInstance();
    const namedImportsToAdd: UtilModule[] = [];
    const existingImports = importer.parseExistingImports(document.getText());

    for (const symbolName of unresolvedSymbols) {
      const moduleMatch = registry.findModuleByName(symbolName);

      if (moduleMatch) {
        const existingPath = existingImports.namespace.get(symbolName);
        if (!existingPath) {
          namedImportsToAdd.push(moduleMatch);
        }
      }
    }

    if (namedImportsToAdd.length === 0) {
      context.addWarning("No matching modules found in the registry.");
      return { addedImports: 0, missingSymbols: Array.from(unresolvedSymbols) };
    }

    const importStatements = importer.getImportRelativeUtilModule(
      ...namedImportsToAdd
    );
    if (!importStatements) {
      context.addWarning("No imports to add.");
      return { addedImports: 0, missingSymbols: Array.from(unresolvedSymbols) };
    }

    const edit = new vscode.WorkspaceEdit();
    edit.insert(documentUri, new vscode.Position(0, 0), importStatements);

    await vscode.workspace.applyEdit(edit);

    const addedCount = namedImportsToAdd.length;
    return {
      addedImports: addedCount,
      missingSymbols: Array.from(unresolvedSymbols),
    };
  },
  cleanup: async (context, _inputs, result, error) => {
    if (error || !result) {
      return;
    }

    if (result.addedImports > 0) {
      context.addMessage(`Added ${result.addedImports} import(s).`);
    }
  },
};

const description =
  "Looks at any unknown objects in a typescript file and if it matches one of the filenames under ixdar-vs/src/utils or ixdar-vs/src/types it imports it at the top of the file with the @ symbol";

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl<
  InputValues,
  CommandResult
>({
  repoName,
  commandName,
  languages,
  description,
  pipeline,
});

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
