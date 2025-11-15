const fs = require("fs");
const path = require("path");

// Track if we've already copied .d.ts files
let declarationFilesCopied = false;

function copyDeclarationFiles(rootContext) {
  if (declarationFilesCopied) return;
  declarationFilesCopied = true;

  const SRC_DIR = path.resolve(rootContext, "src");
  const debugDir = path.resolve(rootContext, "build", "webpack-debug");

  function processDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          processDirectory(fullPath);
        }
      } else if (entry.name.endsWith('.d.ts')) {
        const relativePath = fullPath.slice(SRC_DIR.length).replace(/\\/g, "/");
        
        // Read and transform the .d.ts file
        let source = fs.readFileSync(fullPath, "utf8");
        
        // Transform @/ imports to relative paths with .debug suffix
        source = source.replace(
          /from\s+["']@\/(.*?)["']/g,
          (match, importPath) => {
            const relPath = calculateRelativePath(relativePath, '/' + importPath);
            return `from "${relPath}"`;
          }
        );

        source = source.replace(
          /import\s*\(\s*["']@\/(.*?)["']\s*\)/g,
          (match, importPath) => {
            const relPath = calculateRelativePath(relativePath, '/' + importPath);
            return `import("${relPath}")`;
          }
        );

        // Create output directory
        const debugSubDir = path.join(
          debugDir,
          path.dirname(relativePath.startsWith("/") ? relativePath.slice(1) : relativePath)
        );
        if (!fs.existsSync(debugSubDir)) {
          fs.mkdirSync(debugSubDir, { recursive: true });
        }

        // Write transformed .d.ts file with .debug suffix
        const moduleName = entry.name.replace(/\.d\.ts$/, "");
        const debugFile = path.join(debugSubDir, `${moduleName}.debug.d.ts`);
        
        // Add .debug suffix to imports in type files
        const sourceWithDebug = source.replace(
          /from\s+["'](\.\.?\/[^"']+)["']/g,
          (match, importPath) => {
            return `from "${importPath}.debug"`;
          }
        );
        
        fs.writeFileSync(debugFile, sourceWithDebug, "utf8");
      }
    }
  }

  processDirectory(SRC_DIR);
}

module.exports = function debugOutputLoader(source, inputSourceMap) {
  const callback = this.callback;
  const SRC_DIR = path.resolve(this.rootContext, "src");

  // Copy all .d.ts files on first loader execution
  copyDeclarationFiles(this.rootContext);

  if (!this.resourcePath.startsWith(SRC_DIR)) {
    callback(null, source, inputSourceMap);
    return;
  }

  const relativePath = this.resourcePath
    .slice(SRC_DIR.length)
    .replace(/\\/g, "/");

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

  // Output with .debug.ts suffix and add .debug to relative imports
  const fileName = relativePath.split("/").pop();
  const moduleName = fileName.replace(/\.ts$/, "");
  const debugFileName = `${moduleName}.debug.ts`;
  const debugFile = path.join(debugSubDir, debugFileName);
  
  // Add .debug suffix to relative imports for debug output
  const sourceWithDebug = source.replace(
    /from\s+["'](\.\.?\/[^"']+)["']/g,
    (match, importPath) => {
      return `from "${importPath}.debug"`;
    }
  ).replace(
    /import\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g,
    (match, importPath) => {
      return `import("${importPath}.debug")`;
    }
  );
  
  fs.writeFileSync(debugFile, sourceWithDebug, "utf8");

  callback(null, source, inputSourceMap); // Return original for webpack to continue processing
};
