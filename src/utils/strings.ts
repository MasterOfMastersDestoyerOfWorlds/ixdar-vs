/**
 * Converts a string to PascalCase.
 * Eg. "my_test-string" => "MyTestString"
 */
export function toPascalCase(str: string): string {
    return str
        .replace(/[_\- ]+/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

/**
 * Converts a string to snake_case.
 * Eg. "MyTestString" => "my_test_string"
 */
export function toSnakeCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1') // Add underscores before capitals
        .replace(/[\-\s]+/g, '_')   // Replace spaces/dashes with underscores
        .replace(/^_+/, '')         // Remove leading underscores
        .toLowerCase();
}

/**
 * Converts a string to snake_case.
 * Eg. "MyTestString" => "my_test_string"
 */
export function toSnakeCaseCapitalized(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1') // Add underscores before capitals
        .replace(/[\-\s]+/g, '_')   // Replace spaces/dashes with underscores
        .replace(/^_+/, '')         // Remove leading underscores
        .toUpperCase();
}

/**
 * Converts a string to camelCase.
 * Eg. "my_test-string words" => "myTestStringWords"
 */
export function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return uncapitalize(pascal);
}

export function toDashedCase(term: string): string {
	const lower = term.trim().toLowerCase();
	const dashed = lower.replace(/[^a-z0-9]+/g, '-');
	return dashed.replace(/^-+|-+$/g, '');
}

/**
 * Capitalizes just the first letter of the string.
 * Eg. "hello world" => "Hello world"
 */
export function capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Uncapitalizes just the first letter of the string.
 * Eg. "Hello world" => "hello world"
 */
export function uncapitalize(str: string): string {
    if (!str) return '';
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
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[\s\-_]+/);
}

export function extensionName(): string {
    return 'ixdar-vs';
}
