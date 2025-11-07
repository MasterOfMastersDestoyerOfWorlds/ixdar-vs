/**
 * Registry system for tracking exported utilities and types
 * Similar to CommandRegistry but for util/type discovery and auto-import
 */

export type ExportKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const';

export interface ExportInfo {
  name: string;
  kind: ExportKind;
}

export interface UtilModule {
  filePath: string; // e.g., "@/utils/templating/strings"
  exports: ExportInfo[];
}

/**
 * Singleton registry for utility modules and their exports.
 * Utils register themselves using the @RegisterUtil decorator.
 */
export class UtilRegistry {
  private static instance: UtilRegistry;
  private utils: UtilModule[] = [];

  private constructor() {}

  /**
   * Get the singleton instance of the UtilRegistry
   */
  static getInstance(): UtilRegistry {
    if (!UtilRegistry.instance) {
      UtilRegistry.instance = new UtilRegistry();
    }
    return UtilRegistry.instance;
  }

  /**
   * Register a utility module with its exports
   */
  register(util: UtilModule): void {
    if (!util || !util.filePath) {
      console.warn("Attempted to register invalid util module");
      return;
    }
    
    // Check if already registered and update instead
    const existingIndex = this.utils.findIndex(u => u.filePath === util.filePath);
    if (existingIndex >= 0) {
      this.utils[existingIndex] = util;
    } else {
      this.utils.push(util);
    }
    
    console.log(`Registered util: ${util.filePath} with ${util.exports.length} exports`);
  }

  /**
   * Get all registered utility modules
   */
  getAll(): UtilModule[] {
    return [...this.utils];
  }

  /**
   * Find which util module exports a given symbol
   * Returns the module and export info if found
   */
  findExportByName(symbolName: string): { module: UtilModule; export: ExportInfo } | undefined {
    for (const util of this.utils) {
      const exportInfo = util.exports.find(exp => exp.name === symbolName);
      if (exportInfo) {
        return { module: util, export: exportInfo };
      }
    }
    return undefined;
  }

  /**
   * Find all modules that export a given symbol (in case of duplicates)
   */
  findAllExportsByName(symbolName: string): Array<{ module: UtilModule; export: ExportInfo }> {
    const results: Array<{ module: UtilModule; export: ExportInfo }> = [];
    
    for (const util of this.utils) {
      const exportInfo = util.exports.find(exp => exp.name === symbolName);
      if (exportInfo) {
        results.push({ module: util, export: exportInfo });
      }
    }
    
    return results;
  }

  /**
   * Clear all registered utils (useful for testing)
   */
  clear(): void {
    this.utils = [];
  }
}

/**
 * Decorator to automatically register a util module with the registry.
 * Usage: Apply to a class that wraps the util exports
 *
 * @example
 * @RegisterUtil("@/utils/templating/strings", [
 *   { name: 'toPascalCase', kind: 'function' },
 *   { name: 'StringCases', kind: 'enum' }
 * ])
 * class StringsUtil {
 *   static registered = true;
 * }
 */
export function RegisterUtil(filePath: string, exports: ExportInfo[]) {
  return function <T extends { new (...args: any[]): any }>(constructor: T): T {
    const util: UtilModule = {
      filePath,
      exports,
    };

    UtilRegistry.getInstance().register(util);
    
    return constructor;
  };
}

