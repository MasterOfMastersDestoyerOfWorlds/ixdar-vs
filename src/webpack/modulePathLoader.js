const path = require("path");

// https://webpack.js.org/api/loaders/#the-loader-context look here for this object properties
module.exports = function modulePathLoader(source) {
  const SRC_DIR = path.resolve(this.rootContext, "src");

  if (!this.resourcePath.startsWith(SRC_DIR)) {
    return source;
  }
  const relativePath = this.resourcePath.slice(SRC_DIR.length).replace(/\\/g, "/")
  const moduleName = relativePath.split("/").pop().replace(/\.[^.]+$/, "");

  const relative = relativePath.replace(/\.[^.]+$/, "");
  const modulePath = relative.startsWith("/") ? relative : `/${relative}`;
  const injection = `
  export const __modulePath = ${JSON.stringify(modulePath)};
  export const __moduleName = ${JSON.stringify(moduleName)};
  `;

  return source + injection;
};
