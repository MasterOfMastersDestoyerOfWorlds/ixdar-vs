const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const config = {
  target: "node", // VS Code extensions run in a Node.js context
  mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: "./src/extension.ts", // the entry point of this extension
  output: {
    // the bundle is stored in the 'out' folder (check package.json)
    path: path.resolve(__dirname, "out"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded
    "tree-sitter": "commonjs tree-sitter",
    "tree-sitter-javascript": "commonjs tree-sitter-javascript",
    "tree-sitter-java": "commonjs tree-sitter-java",
    "tree-sitter-python": "commonjs tree-sitter-python",
    "tree-sitter-c-sharp": "commonjs tree-sitter-c-sharp",
    "@modelcontextprotocol/sdk/server/index.js":
      "commonjs @modelcontextprotocol/sdk/server/index.js",
    "@modelcontextprotocol/sdk/types.js":
      "commonjs @modelcontextprotocol/sdk/types.js",
    "@modelcontextprotocol/sdk/server/stdio.js":
      "commonjs @modelcontextprotocol/sdk/server/stdio.js",
    "@modelcontextprotocol/sdk/server/streamableHttp.js":
      "commonjs @modelcontextprotocol/sdk/server/streamableHttp.js",
  },
  resolve: {
    // support reading TypeScript and JavaScript files
    extensions: [".ts", ".js", ".html"],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, "tsconfig.json"),
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.html$/i,
        type: "asset/source",
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                module: "esnext", // override tsconfig module for webpack
              },
            },
          },
        ],
      },
    ],
  },
};

module.exports = config;
