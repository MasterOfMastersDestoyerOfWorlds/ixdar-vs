const path = require("path");
const Parser = require("tree-sitter");
const JavaScript = require("tree-sitter-javascript");

function createParser() {
  const parser = new Parser();
  parser.setLanguage(JavaScript);
  return parser;
}

/**
 * Extract description from a comment that contains @ix-description
 * @param {string} commentText - The full comment text
 * @returns {string|null} - The extracted description or null
 */
function extractDescriptionFromComment(commentText) {
  const match = commentText.match(
    /@ix-description\s+(.+?)(?=\n\s*\*\/|\n\s*\*\s*@|\n\s*\*\s*$|$)/s
  );

  if (!match) {
    return null;
  }

  let description = match[1];

  description = description
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();

  return description;
}

/**
 * Find and extract @ix-description from source code using tree-sitter
 * @param {string} source - The source code
 * @param {string} filePath - The file path
 * @returns {string|null} - The extracted description or null
 */
function findIxDescription(source, filePath) {
  try {
    const parser = createParser();
    const tree = parser.parse(source);

    const language = JavaScript;
    const query = new Parser.Query(language, "(comment) @comment");
    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      const commentNode = match.captures[0].node;
      const commentText = commentNode.text;

      if (commentText.includes("@ix-description")) {
        const description = extractDescriptionFromComment(commentText);
        if (description) {
          return description;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn(
      `Tree-sitter parsing failed for ${filePath}, falling back to regex:`,
      error.message
    );
    return findIxDescriptionFallback(source);
  }
}

/**
 * Fallback method using regex if tree-sitter fails
 * @param {string} source - The source code
 * @returns {string|null} - The extracted description or null
 */
function findIxDescriptionFallback(source) {
  const blockCommentMatch = source.match(
    /\/\*\*[\s\S]*?@ix-description\s+(.+?)(?=\n\s*\*\/|\n\s*\*\s*@)/
  );

  if (blockCommentMatch) {
    let description = blockCommentMatch[1];
    description = description
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .trim();
    return description;
  }

  const singleLineMatch = source.match(/\/\/\s*@ix-description\s+(.+?)$/m);
  if (singleLineMatch) {
    return singleLineMatch[1].trim();
  }

  return null;
}

module.exports = function descriptionLoader(source) {
  const SRC_DIR = path.resolve(this.rootContext, "src");

  if (!this.resourcePath.startsWith(SRC_DIR)) {
    return source;
  }

  const relativePath = this.resourcePath
    .slice(SRC_DIR.length)
    .replace(/\\/g, "/");
  const moduleName = relativePath
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "");

  const description = findIxDescription(source, this.resourcePath);

  const descriptionExport = description
    ? `export const __ix_description = "${description}";`
    : `export const __ix_description = "";`;

  const commandName = description?.split(":")[0]?.trim();

  const commandNameExport = commandName ?
    `export const __ix_command_name = "${commandName}";` :
    `export const __ix_command_name = "";`;

  const ixModuleExport = `export const __ix_module = {
    description: __ix_description,
    commandName: __ix_command_name,
  };`;

  const injection = `
${descriptionExport}
${commandNameExport}
${ixModuleExport}
`;

  return injection + source.trimEnd();
};
