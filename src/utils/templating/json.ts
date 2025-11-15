/**
 * @ix-module-description Use this module for all JSON operations.
 */

export type JsonRecord = Record<string, unknown>;

/**
 * Deep merge two JSON objects.
 * @param target The target object to merge into.
 * @param source The source object to merge from.
 */
export function deepMerge(target: JsonRecord, source: JsonRecord): void {
    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = target[key];
  
      if (!(key in target)) {
        target[key] = sourceValue;
      } else if (
        typeof sourceValue === "object" &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === "object" &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        deepMerge(targetValue as JsonRecord, sourceValue as JsonRecord);
      }
    }
  }