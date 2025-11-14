import * as utilRegistry from "@/utils/utilRegistry";

/**
 * @ix-module-description Utility functions report generator. Creates formatted snapshots of all 
 * registered utility functions organized by module for documentation and inspection.
 */

/**
 * Build a snapshot of all registered util functions including formatted output.
 */
export interface UtilFunctionsReport {
  generatedAt: Date;
  totalModules: number;
  totalFunctions: number;
  content: string;
}

export function buildUtilFunctionsReport(): UtilFunctionsReport {
  const registry = utilRegistry.UtilRegistry.getInstance();
  const allFunctions = registry.getAllFunctions();

  const byModule = new Map<string, utilRegistry.FunctionMetadata[]>();
  for (const metadata of allFunctions) {
    const bucket = byModule.get(metadata.moduleName) ?? [];
    bucket.push(metadata);
    byModule.set(metadata.moduleName, bucket);
  }

  const moduleDirectory = new Map<string, utilRegistry.UtilModule>();
  for (const module of registry.getAllModules()) {
    moduleDirectory.set(module.name, module);
  }

  const generatedAt = new Date();
  const sortedModules = Array.from(byModule.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const lines: string[] = [
    "Util Registry Functions",
    `Generated: ${generatedAt.toISOString()}`,
    `Total Modules: ${sortedModules.length}`,
    `Total Functions: ${allFunctions.length}`,
    "",
  ];

  for (const [moduleName, functions] of sortedModules) {
    const modulePath =
      moduleDirectory.get(moduleName)?.filePath ??
      functions.find((fn) => fn.filePath)?.filePath ??
      "";
    const moduleHeader = modulePath ? `${moduleName} (${modulePath})` : moduleName;
    lines.push(moduleHeader);

    const sortedFunctions = [...functions].sort((a, b) =>
      a.functionName.localeCompare(b.functionName)
    );

    sortedFunctions.forEach((fn, index) => {
      const params = fn.parameters.map((param) => param.name).join(", ");
      const signature = `${fn.functionName}(${params})`;
      const asyncSuffix = fn.isAsync ? " [async]" : "";
      const location = fn.filePath ? ` - ${fn.filePath}` : "";
      lines.push(`  ${index + 1}. ${signature}${asyncSuffix}${location}`);
    });

    lines.push("");
  }

  return {
    generatedAt,
    totalModules: sortedModules.length,
    totalFunctions: allFunctions.length,
    content: lines.join("\n"),
  };
}

