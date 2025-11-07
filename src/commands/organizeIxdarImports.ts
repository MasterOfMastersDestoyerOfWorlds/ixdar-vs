import {
  CommandModuleImpl,
  type CommandModule
} from "@/types/command";
import * as mcp from "@/utils/ai/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";
import { UtilRegistry } from "@/utils/utilRegistry";
import * as vscode from "vscode";

/**
 * organizeIxdarImports: Looks at any unknown objects in a typescript file and if it matches one of the utils under ixdar-vs/src/utils or ixdar-vs/src/types it imports it at the top of the file with the @ symbol
 */
const commandName = "organizeIxdarImports";
const languages = ["typescript", "typescriptreact"];
const repoName = undefined;

interface ImportToAdd {
  modulePath: string;
  symbolName: string;
  isType: boolean;
}

/**
 * Parse existing imports from the document to avoid duplicates
 */
function parseExistingImports(documentText: string): Map<string, Set<string>> {
  const existingImports = new Map<string, Set<string>>();
  
  // Match both regular and type imports
  const importRegex = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+["']([^"']+)["']/g;
  let match;
  
  while ((match = importRegex.exec(documentText)) !== null) {
    const symbols = match[1].split(',').map(s => s.trim());
    const modulePath = match[2];
    
    if (!existingImports.has(modulePath)) {
      existingImports.set(modulePath, new Set());
    }
    
    const moduleSet = existingImports.get(modulePath)!;
    symbols.forEach(symbol => {
      // Remove any "type" prefix from the symbol name
      const cleanSymbol = symbol.replace(/^type\s+/, '');
      moduleSet.add(cleanSymbol);
    });
  }
  
  return existingImports;
}

/**
 * Find the position to insert new imports (after existing imports or at top of file)
 */
function findImportInsertPosition(document: vscode.TextDocument): vscode.Position {
  let lastImportLine = -1;
  
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    
    // Skip empty lines and comments
    if (line === '' || line.startsWith('//') || line.startsWith('/*')) {
      continue;
    }
    
    // Check if it's an import line
    if (line.startsWith('import ')) {
      lastImportLine = i;
    } else if (lastImportLine >= 0) {
      // We've moved past imports
      break;
    }
  }
  
  // If we found imports, insert after the last one
  if (lastImportLine >= 0) {
    return new vscode.Position(lastImportLine + 1, 0);
  }
  
  // Otherwise, insert at the top
  return new vscode.Position(0, 0);
}

/**
 * Generate import statements from the collected imports
 */
function generateImportStatements(importsToAdd: ImportToAdd[]): string {
  // Group imports by module path and type
  const importMap = new Map<string, { types: Set<string>; values: Set<string> }>();
  
  for (const imp of importsToAdd) {
    if (!importMap.has(imp.modulePath)) {
      importMap.set(imp.modulePath, { types: new Set(), values: new Set() });
    }
    
    const group = importMap.get(imp.modulePath)!;
    if (imp.isType) {
      group.types.add(imp.symbolName);
    } else {
      group.values.add(imp.symbolName);
    }
  }
  
  // Generate import statements, sorted by path
  const sortedPaths = Array.from(importMap.keys()).sort();
  const importStatements: string[] = [];
  
  for (const path of sortedPaths) {
    const group = importMap.get(path)!;
    
    // Generate type imports
    if (group.types.size > 0) {
      const symbols = Array.from(group.types).sort().join(", ");
      importStatements.push(`import type { ${symbols} } from "${path}";`);
    }
    
    // Generate value imports
    if (group.values.size > 0) {
      const symbols = Array.from(group.values).sort().join(", ");
      importStatements.push(`import { ${symbols} } from "${path}";`);
    }
  }
  
  return importStatements.join("\n") + "\n";
}

const commandFunc = async () => {
  const editor = inputs.getActiveEditor();
  
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
  const importsToAdd: ImportToAdd[] = [];
  const existingImports = parseExistingImports(document.getText());
  
  for (const symbolName of unresolvedSymbols) {
    const result = registry.findExportByName(symbolName);
    
    if (result) {
      const { module, export: exportInfo } = result;

      const existingSet = existingImports.get(module.filePath);
      if (existingSet && existingSet.has(symbolName)) {
        continue;
      }
      
      const isType = exportInfo.kind === 'interface' || 
                     exportInfo.kind === 'type' ||
                     exportInfo.kind === 'enum';
      
      importsToAdd.push({
        modulePath: module.filePath,
        symbolName: symbolName,
        isType: isType,
      });
    }
  }
  
  if (importsToAdd.length === 0) {
    vscode.window.showInformationMessage("No matching exports found in registry");
    return;
  }
  
  const importStatements = generateImportStatements(importsToAdd);
  const insertPosition = findImportInsertPosition(document);
  
  const edit = new vscode.WorkspaceEdit();
  edit.insert(documentUri, insertPosition, importStatements);
  
  await vscode.workspace.applyEdit(edit);
  
  vscode.window.showInformationMessage(
    `Added ${importsToAdd.length} import(s)`
  );
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
