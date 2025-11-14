const path = require("path");
const { findAnnotation } = require("./commentParser");
const {
  SourceMapSource,
  OriginalSource,
  ConcatSource,
} = require("webpack-sources");

module.exports = function descriptionLoader(source, inputSourceMap) {
  const callback = this.callback;
  const SRC_DIR = path.resolve(this.rootContext, "src");

  if (!this.resourcePath.startsWith(SRC_DIR)) {
    callback(null, source, inputSourceMap);
    return;
  }

  const description = findAnnotation(
    source,
    this.resourcePath,
    "@ix-description"
  );

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

  const injection = `${descriptionExport}
${commandNameExport}
${ixModuleExport}

`;

  let originalSource;
  if (!inputSourceMap) {
    originalSource = new OriginalSource(
      source,
      this.resourcePath // Use the resource path as the 'name'
    );
  } else {
    originalSource = new SourceMapSource(
      source,
      this.resourcePath,
      inputSourceMap
    );
  }

  // 3. Create a ConcatSource to prepend your injection
  const outputSource = new ConcatSource(injection, originalSource);

  // 4. Get the new source AND new map
  const { source: finalSource, map: finalMap } = outputSource.sourceAndMap();

  // 5. Pass the new source and new map to the callback
  callback(null, finalSource.toString(), finalMap);
};
