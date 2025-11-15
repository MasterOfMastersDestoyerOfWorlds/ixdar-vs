const path = require("path");

/**
 * Calculate relative path from one file to another
 * @param {string} fromFile - Source file path (e.g., /commands/callOverFolder.ts)
 * @param {string} toFile - Target file path (e.g., /utils/vscode/fs)
 * @returns {string} - Relative path (e.g., ../../utils/vscode/fs)
 */
function calculateRelativePath(fromFile, toFile) {
  const fromParts = fromFile.split('/').filter(Boolean);
  const toParts = toFile.split('/').filter(Boolean);
  
  // Remove filename from fromParts
  fromParts.pop();
  
  // Calculate how many levels up we need to go
  const upLevels = fromParts.length;
  const upPath = upLevels > 0 ? '../'.repeat(upLevels) : './';
  
  return upPath + toParts.join('/');
}

/**
 * Webpack loader that converts @/ path aliases to relative paths
 * Works for both imports and exports, and handles .ts and .d.ts files
 */
module.exports = function relativePathImportsLoader(source, inputSourceMap) {
  const SRC_DIR = path.resolve(this.rootContext, "src");

  if (!this.resourcePath.startsWith(SRC_DIR)) {
    return source;
  }

  const relativePath = this.resourcePath
    .slice(SRC_DIR.length)
    .replace(/\\/g, "/");

  // Transform @/ imports to relative paths
  let transformedSource = source;

  // Handle import statements: import ... from "@/..."
  transformedSource = transformedSource.replace(
    /from\s+["']@\/(.*?)["']/g,
    (match, importPath) => {
      const relPath = calculateRelativePath(relativePath, '/' + importPath);
      return `from "${relPath}"`;
    }
  );

  // Handle dynamic imports: import("@/...")
  transformedSource = transformedSource.replace(
    /import\s*\(\s*["']@\/(.*?)["']\s*\)/g,
    (match, importPath) => {
      const relPath = calculateRelativePath(relativePath, '/' + importPath);
      return `import("${relPath}")`;
    }
  );

  // Handle export statements: export ... from "@/..."
  transformedSource = transformedSource.replace(
    /export\s+(?:\*|{[^}]*})\s+from\s+["']@\/(.*?)["']/g,
    (match, importPath) => {
      const relPath = calculateRelativePath(relativePath, '/' + importPath);
      // Reconstruct the export statement with relative path
      const exportPart = match.substring(0, match.lastIndexOf('from'));
      return `${exportPart}from "${relPath}"`;
    }
  );

  // Handle require statements: require("@/...")
  transformedSource = transformedSource.replace(
    /require\s*\(\s*["']@\/(.*?)["']\s*\)/g,
    (match, importPath) => {
      const relPath = calculateRelativePath(relativePath, '/' + importPath);
      return `require("${relPath}")`;
    }
  );

  return transformedSource;
};




