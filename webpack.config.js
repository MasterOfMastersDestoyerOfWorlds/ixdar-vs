const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const webpack = require("webpack");

const SRC_DIR = path.resolve(__dirname, "src");

/**@type {import('webpack').Configuration}*/
const config = {
  target: "node", 
  mode: "none", 

  entry: "./src/extension.ts", 
  output: {
    path: path.resolve(__dirname, "out"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: (info) => {
      // Use absolute paths for better debugger compatibility on Windows
      return path.resolve(info.absoluteResourcePath);
    },
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode", 
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
            loader: path.resolve(__dirname, "src", "webpack", "modulePathLoader.js"),
          },
          {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                module: "esnext", 
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [],
};

module.exports = config;
