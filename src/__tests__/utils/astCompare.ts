import Parser from "tree-sitter";
import * as parser from "@/utils/templating/parser";

interface ComparisonResult {
  equal: boolean;
  differences: string[];
}

/**
 * Compare two parse trees for structural and semantic equality,
 * ignoring whitespace differences
 */
export async function compareAst(
  expected: string,
  actual: string,
  languageId: string
): Promise<ComparisonResult> {
  const differences: string[] = [];

  try {
    const expectedTree = await parseCode(expected, languageId);
    const actualTree = await parseCode(actual, languageId);

    compareNodes(
      expectedTree.rootNode,
      actualTree.rootNode,
      "root",
      differences
    );
  } catch (error) {
    // Fallback to normalized string comparison for unsupported languages
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();
    const normalizedActual = actual.replace(/\s+/g, " ").trim();

    if (normalizedExpected !== normalizedActual) {
      differences.push(
        `String comparison (language not supported for AST): texts differ`
      );
    }
  }

  return {
    equal: differences.length === 0,
    differences,
  };
}

async function parseCode(
  code: string,
  languageId: string
): Promise<Parser.Tree> {
  const language = parser.getLanguage(languageId);
  const treeParser = new Parser();
  treeParser.setLanguage(language);
  return treeParser.parse(code);
}

function normalizeText(text: string): string {
  // Remove all whitespace for comparison
  return text.replace(/\s+/g, "");
}

function compareNodes(
  expected: Parser.SyntaxNode,
  actual: Parser.SyntaxNode,
  path: string,
  differences: string[]
): void {
  // Compare node types
  if (expected.type !== actual.type) {
    differences.push(
      `Node type mismatch at ${path}: expected "${expected.type}", got "${actual.type}"`
    );
    return; // Don't continue if types don't match
  }

  // Compare node text (normalized)
  const expectedText = normalizeText(expected.text);
  const actualText = normalizeText(actual.text);

  if (expectedText !== actualText) {
    differences.push(
      `Node text mismatch at ${path} (${expected.type}):\n` +
        `  Expected: "${expected.text.substring(0, 50)}..."\n` +
        `  Actual:   "${actual.text.substring(0, 50)}..."`
    );
    return; // Don't continue comparing children if text doesn't match
  }

  // Compare child counts
  if (expected.namedChildCount !== actual.namedChildCount) {
    differences.push(
      `Child count mismatch at ${path}: expected ${expected.namedChildCount}, got ${actual.namedChildCount}`
    );
    return;
  }

  // Recursively compare children
  for (let i = 0; i < expected.namedChildCount; i++) {
    const expectedChild = expected.namedChild(i);
    const actualChild = actual.namedChild(i);

    if (expectedChild && actualChild) {
      compareNodes(
        expectedChild,
        actualChild,
        `${path}.${expectedChild.type}[${i}]`,
        differences
      );
    }
  }
}

