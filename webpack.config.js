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
    path: path.resolve(__dirname, "build", "out"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
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
            loader: "ts-loader",
            options: {
              compilerOptions: {
                module: "esnext",
              },
            },
          },
          {
            loader: path.resolve(
              __dirname,
              "src",
              "webpack",
              "debugOutputLoader.js"
            ),
          },
          {
            loader: path.resolve(
              __dirname,
              "src",
              "webpack",
              "descriptionLoader.js"
            ),
          },
          {
            loader: path.resolve(
              __dirname,
              "src",
              "webpack",
              "modulePathLoader.js"
            ),
          },
        ],
      },
    ],
  },
  plugins: [],
};

module.exports = config;
