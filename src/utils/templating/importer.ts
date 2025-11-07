/**
 * Get the module path for a given module export object.
 * Looks for the __modulePath export that was injected by the webpack loader.
 */

export function getImport(...moduleExports: any[]): string {
  let result = "";
  for (const moduleExport of moduleExports) {
    if (moduleExport && typeof moduleExport === "object") {
      result +=
        `import * as ${moduleExport.__moduleName} from '${EXTENSION_NAME}/src${moduleExport.__modulePath}';` +
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
        `import * as ${moduleExport.__moduleName} from '@${moduleExport.__modulePath}';` +
        "\n";
    }
  }
  return result;
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

