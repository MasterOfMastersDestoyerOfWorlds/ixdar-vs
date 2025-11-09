
import { UtilModule } from "../utilRegistry";

/**
 * Use this module for generation of import strings, module name, and module path extraction.
 */

/**
 * Get the import string for a given module exports.
 * @param moduleExports - The module exports to get the import for.
 * @returns The import string for the given module exports.
 */
export function getImport(...moduleExports: any[]): string {
  let result = "";
  for (const moduleExport of moduleExports) {
    if (moduleExport && typeof moduleExport === "object") {
      result +=
        `import * as ${getModuleName(moduleExport)} from '${EXTENSION_NAME}/src${getModulePath(moduleExport)}';` +
        "\n";
    }
  }
  return result;
}

export function getImportRelativeUtilModule(
  ...moduleExports: UtilModule[]
): string {
  let result = "";
  for (const moduleExport of moduleExports) {
    if (moduleExport && typeof moduleExport === "object") {
      result +=
        `import * as ${getModuleName(moduleExport)} from '@${getModulePath(moduleExport)}';` +
        "\n";
    }
  }
  return result;
}

export function getImportRelative(...moduleExports: any[]): string {
  let result = "";
  for (const moduleExport of moduleExports) {
    if (moduleExport && typeof moduleExport === "object") {
      result +=
        `import * as ${getModuleName(moduleExport)} from '@${getModulePath(moduleExport)}';` +
        "\n";
    }
  }
  return result;
}

export function getModuleName(moduleExport: any): string {
  return moduleExport.__moduleName;
}
export function getModulePath(moduleExport: any): string {
  return moduleExport.__modulePath;
}

/**
 * Parse existing imports from the document to avoid duplicates
 */
export function parseExistingImports(documentText: string) {
  const named = new Map<string, Set<string>>();
  const namespace = new Map<string, string>();

  const namedRegex =
    /import\s+(?:type\s+)?{([^}]+)}\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = namedRegex.exec(documentText)) !== null) {
    const symbols = match[1].split(",").map((s) => s.trim());
    const modulePath = match[2];

    if (!named.has(modulePath)) {
      named.set(modulePath, new Set());
    }

    const moduleSet = named.get(modulePath)!;
    symbols.forEach((symbol) => {
      const cleanSymbol = symbol.replace(/^type\s+/, "");
      moduleSet.add(cleanSymbol);
    });
  }

  const namespaceRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/g;
  while ((match = namespaceRegex.exec(documentText)) !== null) {
    const alias = match[1];
    const modulePath = match[2];
    namespace.set(alias, modulePath);
  }

  return { named, namespace };
}

export function getImportModule(moduleExports: string) {
  return `import * as ${moduleExports} from "${moduleExports}";`;
}

export function getCallSign(moduleExports: any): string | undefined {
  if (moduleExports && typeof moduleExports === "object") {
    return `${extensionCallSign()}.${moduleExports.__moduleName}`;
  }
  return undefined;
}

export function extensionCallSign(): string {
  return "ixdarVs";
}

export const EXTENSION_NAME = "ixdar-vs";

export const EXTENSION_PREFIX = "ixdar-vs.";

export function extensionCommandName(commandName: string): string {
  return `${EXTENSION_NAME}.${commandName}`;
}

export function getIxdarImport() {
  return `import * as ${extensionCallSign()} from "${EXTENSION_NAME}"`;
}
