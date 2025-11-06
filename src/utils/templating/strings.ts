
/**
 * Converts a string to PascalCase.
 * Eg. "my_test-string" => "MyTestString"
 */
export function toPascalCase(str: string): string {
  return splitToWords(str)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/**
 * Converts a string to snake_case.
 * Eg. "MyTestString" => "my_test_string"
 */
export function toSnakeCase(str: string): string {
  return splitToWords(str)
    .map((word) => `_${word.toLowerCase()}`)
    .join("")
    .replace(/^_+/, "");
}

/**
 * Converts a string to snake_case.
 * Eg. "MyTestString" => "my_test_string"
 */
export function toSnakeCaseCapitalized(str: string): string {
  return splitToWords(str)
    .map((word) => `_${word.toUpperCase()}`)
    .join("")
    .replace(/^_+/, "");
}

export function splitToWords(str: string): string[] {

  let words: string[] = [];
  str.match(/[A-Z_-]+[a-z0-9]+/g)?.forEach((word) => {
    words.push(word);
  });
  return words;
}

/**
 * Converts a string to camelCase.
 * Eg. "my_test-string words" => "myTestStringWords"
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return uncapitalize(pascal);
}

export function toDashedCase(str: string): string {
  return splitToWords(str)
    .map((word) => `-${word.toLowerCase()}`)
    .join("")
    .replace(/^-+|-+$/g, "");
}

/**
 * Capitalizes just the first letter of the string.
 * Eg. "hello world" => "Hello world"
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Uncapitalizes just the first letter of the string.
 * Eg. "Hello world" => "hello world"
 */
export function uncapitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Splits a string into words where capitals occur.
 * Eg. "MyTestString" => ["My", "Test", "String"]
 * Eg. "anXMLParser" => ["an", "XML", "Parser"]
 */
export function splitByCapitals(str: string): string[] {
  if (!str) return [];
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s\-_]+/);
}

export enum StringCases {
  SnakeCase,
  SnakeCaseCapitalized,
  PascalCase,
  CamelCase,
  DashedCase,
  None,
}

/**
 * Checks if a string is in snake_case format.
 * Eg. "my_test_string" => true, "MyTestString" => false
 */
export function isSnakeCase(str: string): boolean {
  if (!str) return false;
  return /^[a-z0-9]+(_[a-z0-9]+)*$/.test(str);
}

/**
 * Checks if a string is in SNAKE_CASE_CAPITALIZED format.
 * Eg. "MY_TEST_STRING" => true, "my_test_string" => false
 */
export function isSnakeCaseCapitalized(str: string): boolean {
  if (!str) return false;
  return /^[A-Z0-9]+(_[A-Z0-9]+)*$/.test(str);
}

/**
 * Checks if a string is in PascalCase format.
 * Eg. "MyTestString" => true, "myTestString" => false
 */
export function isPascalCase(str: string): boolean {
  if (!str) return false;
  return (
    /^[A-Z][a-zA-Z0-9]*$/.test(str) &&
    str !== str.toLowerCase() &&
    str !== str.toUpperCase()
  );
}

/**
 * Checks if a string is in camelCase format.
 * Eg. "myTestString" => true, "MyTestString" => false
 */
export function isCamelCase(str: string): boolean {
  if (!str) return false;
  return (
    /^[a-z][a-zA-Z0-9]*$/.test(str) &&
    str !== str.toLowerCase() &&
    /[A-Z]/.test(str)
  );
}

/**
 * Checks if a string is in dashed-case format.
 * Eg. "my-test-string" => true, "MyTestString" => false
 */
export function isDashedCase(str: string): boolean {
  if (!str) return false;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(str);
}

export function convertString(str: string, caseType: StringCases): string {
  switch (caseType) {
    case StringCases.SnakeCase:
      return toSnakeCase(str);
    case StringCases.SnakeCaseCapitalized:
      return toSnakeCaseCapitalized(str);
    case StringCases.PascalCase:
      return toPascalCase(str);
    case StringCases.CamelCase:
      return toCamelCase(str);
    case StringCases.DashedCase:
      return toDashedCase(str);
    default:
      return str;
  }
}

export function getStringCase(str: string): StringCases {
  if (isSnakeCase(str)) {
    return StringCases.SnakeCase;
  } else if (isSnakeCaseCapitalized(str)) {
    return StringCases.SnakeCaseCapitalized;
  } else if (isPascalCase(str)) {
    return StringCases.PascalCase;
  } else if (isCamelCase(str)) {
    return StringCases.CamelCase;
  } else if (isDashedCase(str)) {
    return StringCases.DashedCase;
  }
  return StringCases.None;
}

export function getAllCases(str: string): string[] {
  return [
    toSnakeCase(str),
    toSnakeCaseCapitalized(str),
    toPascalCase(str),
    toCamelCase(str),
    toDashedCase(str),
    str,
  ];
}

export function getFunctionForCase(caseType: StringCases): string {
  switch (caseType) {
    case StringCases.SnakeCase:
      return "toSnakeCase";
    case StringCases.SnakeCaseCapitalized:
      return "toSnakeCaseCapitalized";
    case StringCases.PascalCase:
      return "toPascalCase";
    case StringCases.CamelCase:
      return "toCamelCase";
    case StringCases.DashedCase:
      return "toDashedCase";
    default:
      return "";
  }
}

export function lineContains(line: string, cases: string[]): boolean {
  let lineParts = line.split(/[\s]+/);
  for (let i = 0; i < lineParts.length; i++) {
    for (let i = 0; i < cases.length; i++) {
      if (lineParts[i] === cases[i]) {
        return true;
      }
    }
  }
  return false;
}

export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str);
}


export function normalizeTsPath(tsPath: string): string {
  return tsPath.replace(/\\/g, "/");
}

export function stripLeadingDot(p: string): string {
  return p.startsWith("./") ? p.slice(2) : p;
}

