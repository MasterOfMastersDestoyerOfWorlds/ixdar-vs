/**
 * Get the module path for a given module export object.
 * Looks for the __modulePath export that was injected by the webpack loader.
 */
export function getImport(moduleExports: any): string | undefined {
  if (moduleExports && typeof moduleExports === "object") {
    return `import * as ${moduleExports.__moduleName} from 'ixdar-vs/src${moduleExports.__modulePath}';`;
  }
  return undefined;
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

export function extensionName(): string {
  return "ixdar-vs";
}

export function extensionCommandName(commandName: string): string {
  return `${extensionName()}.${commandName}`;
}
