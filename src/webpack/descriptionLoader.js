const path = require("path");

function parseParameters(paramList) {
  const parameters = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < paramList.length; i++) {
    const char = paramList[i];
    const prevChar = i > 0 ? paramList[i - 1] : null;

    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }

    if (!inString) {
      if (char === "{" || char === "[" || char === "(" || char === "<") {
        depth++;
      } else if (char === "}" || char === "]" || char === ")" || char === ">") {
        depth--;
      }

      if (char === "," && depth === 0) {
        parameters.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parameters.push(current.trim());
  }

  return parameters.filter(Boolean).map((param, index) => {
    let cleaned = param.replace(/=[\s\S]*$/, "").trim();

    const isRest = cleaned.startsWith("...");
    if (isRest) {
      cleaned = cleaned.slice(3).trim();
    }

    const colonIndex = cleaned.indexOf(":");
    if (colonIndex !== -1) {
      cleaned = cleaned.slice(0, colonIndex).trim();
    }

    cleaned = cleaned.replace(/\?$/, "").trim();

    return cleaned || `param${index}`;
  });
}

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

  const functionRegex = /export\s+(async\s+)?function\s+(\w+)\s*\(/g;
  const registrations = [];
  let index = 0;

  let match;
  while ((match = functionRegex.exec(source)) !== null) {
    const asyncPart = match[1];
    const name = match[2];
    const startPos = match.index + match[0].length;

    let depth = 1;
    let pos = startPos;
    while (pos < source.length && depth > 0) {
      if (source[pos] === "(") depth++;
      else if (source[pos] === ")") depth--;
      pos++;
    }

    const paramList = source.slice(startPos, pos - 1);

    const parameters = parseParameters(paramList);
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
  if (
    /export.*class.*UtilRegistry/.test(source) ||
    /import.*UtilRegistry/.test(source)
  ) {
    importUtilRegistry = "";
  }
  return (
    source.trimEnd() +
    `
${importUtilRegistry}


${registrations.join("")}

UtilRegistry.getInstance().registerModule("${moduleName}", "${modulePath}");
` +
    injection
  );
};
