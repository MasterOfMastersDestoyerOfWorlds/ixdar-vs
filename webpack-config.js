//@ts-check

'use strict';

const path = require('path');
// This plugin will read your tsconfig.json "paths" and make them work in webpack
/** @type {any} */
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
  // Sets the target environment to Node.js
  target: 'node',
  // Tells webpack to bundle for external use, not for a browser
  mode: 'none',

  // This is your extension's entry point
  entry: './src/extension.ts',
  output: {
    // The bundle is stored in the 'out' folder (like your tsconfig.json)
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    // The 'vscode' module is provided by the extension host
    vscode: 'commonjs vscode',
    
    // IMPORTANT: Exclude tree-sitter and its native grammars from the bundle
    'tree-sitter': 'commonjs tree-sitter',
    'tree-sitter-javascript': 'commonjs tree-sitter-javascript',
    'tree-sitter-java': 'commonjs tree-sitter-java',
    'tree-sitter-python': 'commonjs tree-sitter-python',
    'tree-sitter-c-sharp': 'commonjs tree-sitter-c-sharp',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    
    // We remove the manual 'alias' block as it conflicts
    // with the TsconfigPathsPlugin.

    plugins: [
      // This is the magic that resolves your "@/*" paths
      new TsconfigPathsPlugin({
        configFile: './tsconfig.json',
        // We must tell the PLUGIN itself what main files to
        // look for when it resolves a directory alias (like '@').
        mainFiles: ['extension', 'index']
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // This option speeds up compilation and
              // delegates path resolution to tsconfig-paths-webpack-plugin
              transpileOnly: true,
              // Force ts-loader to output CommonJS modules that
              // webpack can understand, regardless of tsconfig.json
              compilerOptions: {
                "module": "commonjs"
              }
            }
          },
        ],
      },
    ],
  },
  devtool: 'source-map',
};
module.exports = config;

