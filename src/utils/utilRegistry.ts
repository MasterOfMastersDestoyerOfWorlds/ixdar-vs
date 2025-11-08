/**
 * Registry system for tracking utility modules and their exported functions.
 * Modules register themselves via @RegisterUtilModule and individual functions
 * register via @UtilFuncRegistry.
 */

export interface FunctionParameterInfo {
  index: number;
  name: string;
}

export interface FunctionMetadata {
  moduleName: string;
  functionName: string;
  parameters: FunctionParameterInfo[];
  isAsync: boolean;
  filePath?: string;
}

export interface UtilModule {
  name: string;
  filePath: string;
}

function getFunctionKey(moduleName: string, functionName: string): string {
  return `${moduleName}:${functionName}`;
}

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

  static getInstance(): UtilRegistry {
    if (!UtilRegistry.instance) {
      UtilRegistry.instance = new UtilRegistry();
    }
    return UtilRegistry.instance;
  }

  registerModule(moduleName: string, filePath: string): void {
    if (!moduleName || !filePath) {
      console.warn("Attempted to register module without name or filePath");
      return;
    }

    this.modules.set(moduleName, { name: moduleName, filePath });

    for (const metadata of this.functionMetadata.values()) {
      if (metadata.moduleName === moduleName) {
        metadata.filePath = filePath;
      }
    }
  }

  registerFunction(metadata: FunctionMetadata): void {
    if (!metadata.moduleName || !metadata.functionName) {
      console.warn("Attempted to register function without moduleName or functionName");
      return;
    }

    const moduleInfo = this.modules.get(metadata.moduleName);
    const metadataWithPath: FunctionMetadata = {
      ...metadata,
      filePath: metadata.filePath ?? moduleInfo?.filePath,
    };

    const key = getFunctionKey(metadataWithPath.moduleName, metadataWithPath.functionName);
    this.functionMetadata.set(key, metadataWithPath);
  }

  findModuleByName(moduleName: string): UtilModule | undefined {
    return this.modules.get(moduleName);
  }

  getModulePath(moduleName: string): string | undefined {
    return this.modules.get(moduleName)?.filePath;
  }

  getAllModules(): UtilModule[] {
    return Array.from(this.modules.values());
  }

  getFunctionsByModule(moduleName: string): FunctionMetadata[] {
    return Array.from(this.functionMetadata.values()).filter(
      (metadata) => metadata.moduleName === moduleName
    );
  }

  findFunctionsByName(functionName: string): FunctionMetadata[] {
    return Array.from(this.functionMetadata.values()).filter(
      (metadata) => metadata.functionName === functionName
    );
  }

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
export function RegisterUtilModule(moduleName: string, filePath: string) {
  return function <T extends { new (...args: any[]): any }>(constructor: T): T {
    UtilRegistry.getInstance().registerModule(moduleName, filePath);
    return constructor;
  };
}

