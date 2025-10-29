import * as vscode from "vscode";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import Java from "tree-sitter-java";
import Python from "tree-sitter-python";
import CSharp from "tree-sitter-c-sharp";

/**
 * Cache entry for a parsed document
 */
interface ParseCacheEntry {
  tree: Parser.Tree;
  version: number;
}

/**
 * Global parse tree cache: Maps document URI to cached parse tree
 */
const parseCache = new Map<string, ParseCacheEntry>();

/**
 * Parser instances for each supported language
 */
const parsers = {
  javascript: createParser(JavaScript),
  typescript: createParser(JavaScript), // TypeScript uses JS grammar
  javascriptreact: createParser(JavaScript),
  typescriptreact: createParser(JavaScript),
  java: createParser(Java),
  python: createParser(Python),
  csharp: createParser(CSharp),
};

/**
 * Create a parser instance with the given language
 */
function createParser(language: any): Parser {
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/**
 * Get the appropriate parser for a language ID
 */
export function getParserForLanguage(languageId: string): Parser | null {
  const normalizedLangId = languageId.toLowerCase();

  if (normalizedLangId in parsers) {
    return parsers[normalizedLangId as keyof typeof parsers];
  }

  return null;
}

export function getLanguage(languageId: string): any | null {
  const normalizedLangId = languageId.toLowerCase();

  if (normalizedLangId in parsers) {
    // Return the language module used by the parser, not the parser itself
    // The parser instances are created with a language ("setLanguage(language)")
    // We need to return that "language" object.
    switch (normalizedLangId) {
      case "javascript":
      case "typescript":
      case "javascriptreact":
      case "typescriptreact":
        return JavaScript;
      case "java":
        return Java;
      case "python":
        return Python;
      case "csharp":
        return CSharp;
      default:
        return null;
    }
  }

  return null;
}
/**
 * Get the parse tree for a document, using cache when possible
 * @param document The VS Code document to parse
 * @param oldTree Optional previous tree for incremental parsing
 * @returns The parse tree, or null if language not supported
 */
export function getParseTree(
  document: vscode.TextDocument,
  oldTree?: Parser.Tree
): Parser.Tree | null {
  const parser = getParserForLanguage(document.languageId);

  if (!parser) {
    return null;
  }

  const uri = document.uri.toString();
  const version = document.version;

  // Check cache first
  const cached = parseCache.get(uri);
  if (cached && cached.version === version) {
    return cached.tree;
  }

  // Parse the document (incrementally if we have an old tree)
  const text = document.getText();
  const tree = parser.parse(text, oldTree);

  // Update cache
  parseCache.set(uri, { tree, version });

  return tree;
}

/**
 * Incrementally update the parse tree for a document after changes
 * @param document The document that changed
 * @param changes The content changes that occurred
 */
export function updateParseTree(
  document: vscode.TextDocument,
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): Parser.Tree | null {
  const uri = document.uri.toString();
  const cached = parseCache.get(uri);

  // Get old tree if available
  const oldTree = cached?.tree;

  // Parse with incremental support
  return getParseTree(document, oldTree);
}

/**
 * Clear the parse tree cache for a document
 * @param document The document to clear from cache
 */
export function clearParseTree(document: vscode.TextDocument): void {
  const uri = document.uri.toString();
  parseCache.delete(uri);
}

/**
 * Clear all cached parse trees
 */
export function clearAllParseTrees(): void {
  parseCache.clear();
}

/**
 * Check if a language is supported by the parser
 * @param languageId The VS Code language identifier
 * @returns True if the language is supported
 */
export function isLanguageSupported(languageId: string): boolean {
  return getParserForLanguage(languageId) !== null;
}

/**
 * Get all supported language IDs
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(parsers);
}
