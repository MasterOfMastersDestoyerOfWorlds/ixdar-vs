const path = require("path");
const { findAnnotation } = require("./commentParser");

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

  const description = findAnnotation(source, this.resourcePath, '@ix-description');

  const descriptionExport = description
    ? `export const __ix_description = ${JSON.stringify(description)};`
    : `export const __ix_description = "";`;

  // Extract command name from description (format: "commandName: description")
  const commandName = description?.split(":")[0]?.trim();

  const commandNameExport = commandName
    ? `export const __ix_command_name = ${JSON.stringify(commandName)};`
    : `export const __ix_command_name = "";`;

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
