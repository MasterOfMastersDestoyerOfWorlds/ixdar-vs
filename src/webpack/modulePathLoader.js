const path = require("path");

// https://webpack.js.org/api/loaders/#the-loader-context look here for this object properties
module.exports = function modulePathLoader(source) {
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

  const relative = relativePath.replace(/\.[^.]+$/, "");
  const modulePath = relative.startsWith("/") ? relative : `/${relative}`;
  const injection = `
  export const __modulePath = ${JSON.stringify(modulePath)};
  export const __moduleName = ${JSON.stringify(moduleName)};
  `;


  const regex = /export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
  const registrations = [];
  let index = 0;
  for (const match of source.matchAll(regex)) {
    const [, asyncPart, name, paramList] = match;
    const parameters = paramList
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p, index) => {
        const cleaned = p
          .replace(/=[\s\S]*/g, "")
          .replace(/\?.*/, "")
          .replace(/^\.\.\./, "")
          .trim();
        return cleaned || `param${index}`;
      });
    registrations.push(`
UtilRegistry.getInstance().registerFunction({
  moduleName: "${moduleName}",
  isAsync: ${asyncPart === undefined},
  functionName: "${name}",
  parameters: [${parameters.map((p) => `{index: ${index}, name: "${p}"}`).join(", ")}]
});
`);
    index++;
  }
  importUtilRegistry = `import { UtilRegistry } from "@/utils/utilRegistry";`;
  if (/export.*class.*UtilRegistry/.test(source) || /import.*UtilRegistry/.test(source)) {
    importUtilRegistry = "";
  }
  return (
    source.trimEnd() +
    `
${importUtilRegistry}
// Auto-generated UtilRegistry registrations for Module: ${moduleName}

${registrations.join("")}

UtilRegistry.getInstance().registerModule("${moduleName}", "${modulePath}");
` +
    injection
  );
};
