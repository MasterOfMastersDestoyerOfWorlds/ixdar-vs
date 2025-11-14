const fs = require("fs");
const path = require("path");

function calculateRelativePath(fromFile, toFile) {
  // fromFile: /commands/callOverFolder.ts
  // toFile: /utils/vscode/fs
  // result: ../../utils/vscode/fs.debug
  
  const fromParts = fromFile.split('/').filter(Boolean);
  const toParts = toFile.split('/').filter(Boolean);
  
  // Remove filename from fromParts
  fromParts.pop();
  
  // Calculate how many levels up we need to go
  const upLevels = fromParts.length;
  const upPath = '../'.repeat(upLevels);
  
  // Add .debug suffix to the import path
  return upPath + toParts.join('/') + '.debug';
}

module.exports = function debugOutputLoader(source) {
  const SRC_DIR = path.resolve(this.rootContext, "src");

  if (!this.resourcePath.startsWith(SRC_DIR)) {
    return source;
  }

  const relativePath = this.resourcePath
    .slice(SRC_DIR.length)
    .replace(/\\/g, "/");

  // Transform @/ imports to relative paths with .debug suffix
  let transformedSource = source.replace(
    /from\s+["']@\/(.*?)["']/g,
    (match, importPath) => {
      const relPath = calculateRelativePath(relativePath, '/' + importPath);
      return `from "${relPath}"`;
    }
  );

  transformedSource = transformedSource.replace(
    /import\s*\(\s*["']@\/(.*?)["']\s*\)/g,
    (match, importPath) => {
      const relPath = calculateRelativePath(relativePath, '/' + importPath);
      return `import("${relPath}")`;
    }
  );

  // Create debug directory
  const debugDir = path.resolve(this.rootContext, "build", "webpack-debug");
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  // Preserve directory structure in debug output
  const debugSubDir = path.join(
    debugDir,
    path.dirname(relativePath.startsWith("/") ? relativePath.slice(1) : relativePath)
  );
  if (!fs.existsSync(debugSubDir)) {
    fs.mkdirSync(debugSubDir, { recursive: true });
  }

  // Output with .debug.ts suffix
  const moduleName = relativePath.split("/").pop().replace(/\.[^.]+$/, "");
  const debugFile = path.join(debugSubDir, `${moduleName}.debug.ts`);
  fs.writeFileSync(debugFile, transformedSource, "utf8");

  return source; // Return original for webpack to continue processing
};
