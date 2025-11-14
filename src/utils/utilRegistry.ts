/**
 * @ix-module-description Registry system for tracking utility modules and their exported functions. 
 * Use this to register modules via @RegisterUtilModule decorator and query available utility functions.
 */

/**
 * Function parameter information
 */
export interface FunctionParameterInfo {
  index: number;
  name: string;
}

/**
 * Function metadata
 */
export interface FunctionMetadata {
  moduleName: string;
  functionName: string;
  parameters: FunctionParameterInfo[];
  isAsync: boolean;
  filePath?: string;
}

/**
 * Utility module information
 */
export interface UtilModule {
  category: string;
  name: string;
  filePath: string;
  description?: string;
}

/**
 * Get the function key
 * @param moduleName The name of the module
 * @param functionName The name of the function
 * @returns The function key
 */
function getFunctionKey(moduleName: string, functionName: string): string {
  return `${moduleName}:${functionName}`;
}

/**
 * Extract parameter information from a function
 * @param fn The function to extract parameter information from
 * @returns The parameter information
 */
function extractParameterInfo(fn: Function): FunctionParameterInfo[] {
  const fnString = fn
    .toString()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const match =
    fnString.match(/^[^(]*\(\s*([^)]*)\)/) ??
    fnString.match(/\(\s*([^)]*)\)\s*=>/) ??
    fnString.match(/^[^\(]*\s*([^\s=]+)\s*=>/);

  if (!match || !match[1]) {
    return [];
  }

  const paramsSection = match[1];
  if (!paramsSection.trim()) {
    return [];
  }

  const rawParams = paramsSection.split(",");
  return rawParams
    .map((rawParam, index) => {
      const cleaned = rawParam
        .trim()
        .replace(/=[\s\S]*/g, "")
        .replace(/\s*\?.*/, "")
        .replace(/^\.\.\./, "")
        .trim();

      const name = cleaned || `param${index}`;
      return {
        index,
        name,
      };
    })
    .filter((param) => param.name.length > 0);
}

/**
 * Singleton registry for utility modules and their functions.
 */
export class UtilRegistry {
  private static instance: UtilRegistry;

  private modules = new Map<string, UtilModule>();
  private functionMetadata = new Map<string, FunctionMetadata>();

  private constructor() {}

  /**
   * Get the instance of the utility registry
   * @returns The instance of the utility registry
   */
  static getInstance(): UtilRegistry {
    if (!UtilRegistry.instance) {
      UtilRegistry.instance = new UtilRegistry();
    }
    return UtilRegistry.instance;
  }

  /**
   * Register a module with the utility registry
   * @param moduleName The name of the module
   * @param filePath The file path of the module
   * @param description Optional description of the module
   */
  registerModule(
    moduleName: string,
    filePath: string,
    description?: string
  ): void {
    if (!moduleName || !filePath) {
      console.warn("Attempted to register module without name or filePath");
      return;
    }
    const pathParts = filePath.split("/");
    const category = pathParts[pathParts.length - 2];
    this.modules.set(moduleName, {
      category,
      name: moduleName,
      filePath,
      description,
    });

    for (const metadata of this.functionMetadata.values()) {
      if (metadata.moduleName === moduleName) {
        metadata.filePath = filePath;
      }
    }
  }

  /**
   * Register a function with the utility registry
   * @param metadata The metadata of the function
   */
  registerFunction(metadata: FunctionMetadata): void {
    if (!metadata.moduleName || !metadata.functionName) {
      console.warn(
        "Attempted to register function without moduleName or functionName"
      );
      return;
    }

    const moduleInfo = this.modules.get(metadata.moduleName);
    const metadataWithPath: FunctionMetadata = {
      ...metadata,
      filePath: metadata.filePath ?? moduleInfo?.filePath,
    };

    const key = getFunctionKey(
      metadataWithPath.moduleName,
      metadataWithPath.functionName
    );
    this.functionMetadata.set(key, metadataWithPath);
  }

  /**
   * Find a module by name
   * @param moduleName The name of the module
   * @returns The module
   */
  findModuleByName(moduleName: string): UtilModule | undefined {
    return this.modules.get(moduleName);
  }

  /**
   * Get the file path of a module
   * @param moduleName The name of the module
   * @returns The file path of the module
   */
  getModulePath(moduleName: string): string | undefined {
    return this.modules.get(moduleName)?.filePath;
  }

  /**
   * Get all modules
   * @returns All modules
   */
  getAllModules(): UtilModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get all registered function metadata
   * @returns All function metadata entries
   */
  getAllFunctions(): FunctionMetadata[] {
    return Array.from(this.functionMetadata.values());
  }

  /**
   * Get all functions by module name
   * @param moduleName The name of the module
   * @returns All functions by module name
   */
  getFunctionsByModule(moduleName: string): FunctionMetadata[] {
    return Array.from(this.functionMetadata.values()).filter(
      (metadata) => metadata.moduleName === moduleName
    );
  }

  /**
   * Find functions by name
   * @param functionName The name of the function
   * @returns All functions by name
   */
  findFunctionsByName(functionName: string): FunctionMetadata[] {
    return Array.from(this.functionMetadata.values()).filter(
      (metadata) => metadata.functionName === functionName
    );
  }

  /**
   * Clear the utility registry
   */
  clear(): void {
    this.modules.clear();
    this.functionMetadata.clear();
  }
}

/**
 * Decorator to register a module with the util registry.
 *
 * @example
 * @RegisterUtilModule("strings", "@/utils/templating/strings")
 * class StringsModule {}
 */
export function RegisterUtilModule(
  moduleName: string,
  filePath: string,
  description?: string
) {
  return function <T extends { new (...args: any[]): any }>(constructor: T): T {
    UtilRegistry.getInstance().registerModule(
      moduleName,
      filePath,
      description
    );
    return constructor;
  };
}
