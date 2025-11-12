const fs = require("fs");
const path = require("path");

/**
 * Debug loader that outputs the transformed source to a debug directory
 * This helps diagnose issues with other loaders in the chain
 */
module.exports = function debugOutputLoader(source) {
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

  const debugFile = path.join(debugSubDir, `${moduleName}.debug.ts`);
  fs.writeFileSync(debugFile, source, "utf8");

  return source;
};

