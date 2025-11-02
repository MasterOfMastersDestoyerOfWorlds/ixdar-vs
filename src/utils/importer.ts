/**
 * Get the module path for a given module export object.
 * Looks for the __modulePath export that was injected by the webpack loader.
 */
export function getImportStatementForModule(moduleExports: any): string | undefined {
  if (moduleExports && typeof moduleExports === 'object') {
    return `import * as ${moduleExports.__moduleName} from 'ixdar-vs/src${moduleExports.__modulePath}';`;
  }
  return undefined;
}