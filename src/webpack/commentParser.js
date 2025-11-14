const Parser = require("tree-sitter");
const JavaScript = require("tree-sitter-javascript");

/**
 * Create a tree-sitter parser instance for JavaScript/TypeScript
 * @returns {Parser} - Configured parser instance
 */
function createParser() {
  const parser = new Parser();
  parser.setLanguage(JavaScript);
  return parser;
}

/**
 * Extract content from a comment that contains a specific annotation
 * @param {string} commentText - The full comment text
 * @param {string} annotationName - The annotation to search for (e.g., '@ix-description')
 * @returns {string|null} - The extracted content or null
 */
function extractAnnotationFromComment(commentText, annotationName) {
  // Escape special regex characters in annotation name
  const escapedAnnotation = annotationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Match annotation and capture content until end of comment or next annotation
  const pattern = new RegExp(
    `${escapedAnnotation}\\s+(.+?)(?=\\n\\s*\\*\\/|\\n\\s*\\*\\s*@|\\n\\s*\\*\\s*$|$)`,
    's'
  );
  
  const match = commentText.match(pattern);
  
  if (!match) {
    return null;
  }

  let content = match[1];

  // Clean up comment formatting:
  // - Remove leading * from each line
  // - Remove extra whitespace
  // - Join multiple lines
  content = content
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();

  return content;
}

/**
 * Find and extract an annotation from source code using tree-sitter
 * @param {string} source - The source code
 * @param {string} filePath - The file path (for error reporting)
 * @param {string} annotationName - The annotation to search for (e.g., '@ix-description')
 * @returns {string|null} - The extracted content or null
 */
function findAnnotation(source, filePath, annotationName) {
  try {
    const parser = createParser();
    const tree = parser.parse(source);

    const language = JavaScript;
    const query = new Parser.Query(language, '(comment) @comment');
    const matches = query.matches(tree.rootNode);

    // Search through all comments for the annotation
    for (const match of matches) {
      const commentNode = match.captures[0].node;
      const commentText = commentNode.text;

      if (commentText.includes(annotationName)) {
        const content = extractAnnotationFromComment(commentText, annotationName);
        if (content) {
          return content;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn(
      `Tree-sitter parsing failed for ${filePath}, falling back to regex:`,
      error.message
    );
    return findAnnotationFallback(source, annotationName);
  }
}

/**
 * Fallback method using regex if tree-sitter fails
 * @param {string} source - The source code
 * @param {string} annotationName - The annotation to search for (e.g., '@ix-description')
 * @returns {string|null} - The extracted content or null
 */
function findAnnotationFallback(source, annotationName) {
  // Escape special regex characters in annotation name
  const escapedAnnotation = annotationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match JSDoc-style comments with the annotation
  const blockCommentPattern = new RegExp(
    `\\/\\*\\*[\\s\\S]*?${escapedAnnotation}\\s+(.+?)(?=\\n\\s*\\*\\/|\\n\\s*\\*\\s*@)`
  );
  const blockCommentMatch = source.match(blockCommentPattern);

  if (blockCommentMatch) {
    let content = blockCommentMatch[1];
    content = content
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter((line) => line.length > 0)
      .join(' ')
      .trim();
    return content;
  }

  // Match single-line comments with the annotation
  const singleLinePattern = new RegExp(
    `\\/\\/\\s*${escapedAnnotation}\\s+(.+?)$`,
    'm'
  );
  const singleLineMatch = source.match(singleLinePattern);
  if (singleLineMatch) {
    return singleLineMatch[1].trim();
  }

  return null;
}

module.exports = {
  createParser,
  extractAnnotationFromComment,
  findAnnotation,
  findAnnotationFallback,
};

