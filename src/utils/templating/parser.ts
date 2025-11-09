import * as vscode from "vscode";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import Java from "tree-sitter-java";
import Python from "tree-sitter-python";
import CSharp from "tree-sitter-c-sharp";
import { MethodInfo } from "@/types/parser";

/**
 * Use this module for all multi-word string manipulation and structural 
 * pattern matching and structure changes of code files. This module uses
 * tree-sitter for its parsing and structural manipulation.
 */

export class ParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParsingError";
  }
}

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
export function getParserForLanguage(languageId: string): Parser {
  const normalizedLangId = languageId.toLowerCase();

  if (normalizedLangId in parsers) {
    return parsers[normalizedLangId as keyof typeof parsers];
  }

  throw new ParsingError("Language not supported: " + languageId);
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
        throw new ParsingError("Language not supported: " + languageId);
    }
  }
  throw new ParsingError("Language not supported: " + languageId);
}
/**
 * Get the parse tree for a document, using cache when possible
 * @param document The VS Code document to parse
 * @param oldTree Optional previous tree for incremental parsing
 * @returns The parse tree, or null if language not supported
 * @throws ParsingError if the document cannot be parsed
 */
export function getParseTree(
  document: vscode.TextDocument,
  oldTree?: Parser.Tree
): Parser.Tree {
  const parser = getParserForLanguage(document.languageId);
  const uri = document.uri.toString();
  const version = document.version;
  const cached = parseCache.get(uri);
  if (cached && cached.version === version) {
    return cached.tree;
  }
  const text = document.getText();
  const tree = parser.parse(text, oldTree);
  parseCache.set(uri, { tree, version });
  if (!tree) {
    throw new ParsingError(
      "Failed to parse document: " + document.uri.toString()
    );
  }
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

  const oldTree = cached?.tree;
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

export function getLineCommentKeyword(languageId: string) {
  switch (languageId) {
    case "javascript":
      return "comment";
    case "typescript":
      return "comment";
    case "javascriptreact":
      return "comment";
    case "typescriptreact":
      return "comment";
    case "java":
      return "line_comment";
    case "python":
      return "comment";
    case "csharp":
      return "comment";
  }
}
export function getCommentSymbol(languageId: string): string {
  switch (languageId) {
    case "javascript":
      return "//";
    case "typescript":
      return "//";
    case "javascriptreact":
      return "//";
    case "typescriptreact":
      return "//";
    case "java":
      return "//";
    case "python":
      return "#";
    case "csharp":
      return "//";
  }
  return "//";
}

/**
 * Get tree-sitter query for finding methods/functions based on language
 */
export function getMethodQuery(languageId: string): string {
  switch (languageId.toLowerCase()) {
    case "javascript":
    case "typescript":
    case "javascriptreact":
    case "typescriptreact":
      return `
        (function_declaration name: (identifier) @name) @function
        (method_definition name: (property_identifier) @name) @function
        (arrow_function) @function
        (function_expression) @function
      `;
    case "python":
      return `
        (function_definition name: (identifier) @name) @function
      `;
    case "java":
      return `
        (method_declaration name: (identifier) @name) @function
      `;
    case "csharp":
      return `
        (method_declaration name: (identifier) @name) @function
      `;
    default:
      return "";
  }
}

/**
 * Validate a tree-sitter query string
 * @param queryString The query string to validate
 * @param language The tree-sitter language object
 * @returns An object with valid flag and optional error message
 */
export function validateQuery(
  queryString: string,
  language: any
): { valid: boolean; error?: string } {
  if (!queryString) {
    return { valid: false };
  }
  try {
    new Parser.Query(language, queryString);
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Execute a tree-sitter query on a parse tree
 * @param tree The parse tree to query
 * @param queryString The query string
 * @param language The tree-sitter language object
 * @returns Array of query matches with captures
 */
export function executeQuery(
  tree: Parser.Tree,
  queryString: string,
  language: any
): Array<{ captures: Array<{ name: string; node: Parser.SyntaxNode }> }> {
  try {
    const query = new Parser.Query(language, queryString);
    const matches = query.matches(tree.rootNode);
    return matches.map((match: any) => ({
      captures: match.captures.map((capture: any) => ({
        name: capture.name,
        node: capture.node,
      })),
    }));
  } catch (error) {
    throw new ParsingError("Error executing query: " + error);
  }
}

export function extractMethods(
  tree: Parser.Tree,
  document: vscode.TextDocument,
  language: any
): MethodInfo[] {
  const queryString = getMethodQuery(document.languageId);
  if (!queryString) {
    throw new ParsingError("No query string found for this language.");
  }

  const methods: MethodInfo[] = [];
  const matches = executeQuery(tree, queryString, language);

  for (const match of matches) {
    let functionNode: Parser.SyntaxNode | null = null;
    let nameNode: Parser.SyntaxNode | null = null;

    for (const capture of match.captures) {
      if (capture.name === "function") {
        functionNode = capture.node;
      } else if (capture.name === "name") {
        nameNode = capture.node;
      }
    }

    if (functionNode) {
      const text = document.getText(
        new vscode.Range(
          document.positionAt(functionNode.startIndex),
          document.positionAt(functionNode.endIndex)
        )
      );

      const name = nameNode
        ? document.getText(
            new vscode.Range(
              document.positionAt(nameNode.startIndex),
              document.positionAt(nameNode.endIndex)
            )
          )
        : `anonymous_${functionNode.startIndex}`;

      methods.push({
        name,
        node: functionNode,
        text,
        startPosition: document.positionAt(functionNode.startIndex),
        endPosition: document.positionAt(functionNode.endIndex),
      });
    }
  }

  if (methods.length === 0) {
    throw new ParsingError("No methods or functions found in this file.");
  }

  return methods;
}
export function findLCA(
  startNode: Parser.SyntaxNode,
  endNode: Parser.SyntaxNode,
  tree: Parser.Tree
) {
  let current: Parser.SyntaxNode | null = startNode;
  while (current) {
    if (
      current.startIndex <= endNode.startIndex &&
      current.endIndex >= endNode.endIndex
    ) {
      return current;
    }
    current = current.parent;
  }
  return tree.rootNode;
}
