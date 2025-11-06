# ixdar-vs

A recursive command and templating system for VS Code with Model Context Protocol (MCP) support.

## Overview

`ixdar-vs` is both a VS Code extension and a TypeScript library that enables **recursive, workspace-aware command development**. It provides a powerful framework for creating custom VS Code commands that can be dynamically loaded, composed, and shared across projects.

### Key Concepts

- 🔄 **Recursive Commands**: Create commands that can load and register other commands dynamically
- 📦 **Workspace Templates**: Each workspace can define its own commands in a `.ix/` folder
- 🎯 **Library + Extension**: Dual-build system provides both a VS Code extension and a reusable npm library
- 🤖 **MCP Integration**: All commands are automatically exposed via Model Context Protocol for AI assistants
- 🔧 **On-the-Fly Compilation**: TypeScript commands in `.ix/` are compiled and loaded at runtime

## How It Works

### 1. The `.ix/` Workspace

When you run `IX: Make Template From File`, ixdar-vs creates a `.ix/` folder in your workspace with:

```
.ix/
├── package.json          # Depends on ixdar-vs as a library
├── tsconfig.json         # Inherits your project's TypeScript config
├── node_modules/
│   └── ixdar-vs/        # Full access to the library API
└── yourCommand.ts       # Your custom commands
```

### 2. Creating Custom Commands

Commands in `.ix/` are TypeScript files that export a `CommandModule`:

```typescript
import { CommandModuleImpl } from "ixdar-vs/command";
import type { McpResult } from "ixdar-vs/command";
import * as vscode from "vscode";

const command = new CommandModuleImpl(
  undefined,              // repo name (optional)
  "myCustomCommand",      // command name
  ["typescript", "javascript"], // supported languages
  async () => {
    // Your VS Code command logic
    const editor = vscode.window.activeTextEditor;
    // ... do something
  },
  "Description of what this command does",
  {
    type: "object",
    properties: {
      // MCP input schema
    }
  },
  async (args) => {
    // Optional MCP handler
    return { content: [{ type: "text", text: "Result" }] };
  }
);

export default command;
```

### 3. Dynamic Loading

At activation, ixdar-vs:
1. Scans all `.ix/` folders in your workspace
2. Compiles TypeScript files using the TypeScript Compiler API
3. Resolves dependencies from `.ix/node_modules` and workspace `node_modules`
4. Executes commands in a VM sandbox with access to VS Code APIs
5. Registers commands with VS Code and the MCP server

### 4. Dual-Build Architecture

**For VS Code Extension:**
- Webpack bundles everything into `out/extension.js`
- VS Code loads this single file via `"main": "./out/extension.js"`

**For Library Consumers:**
- TypeScript compiler outputs individual modules to `lib/`
- Package exports enable subpath imports: `ixdar-vs/command`, `ixdar-vs/mcp`, etc.
- Child workspaces can `require('ixdar-vs/...')` and get the actual compiled modules

## Built-in Commands

### `IX: Ixdar Command` (`ixCommand`)
Opens a quick pick menu to execute any registered command (including dynamically loaded `.ix/` commands).

### `IX: New Ixdar Command` (`newIxdarCommand`)
Scaffolds a new command in your `.ix/` workspace with a template.

### `IX: Make Template From File` (`makeTemplateFromFile`)
Creates or updates the `.ix/` workspace in your current project.

### `IX: zBreakPoint` (`Ctrl+Shift+B`)
Inserts a conditional breakpoint snippet for debugging.

### `IX: Capture Regex` (`captureRegex`)
Interactive regex testing and capture group exploration.

### `IX: Remove All Comments` (`removeAllComments`)
Strips single-line comments from code files.

### `IX: Tree-sitter Inspector` (`treeSitterInspector`)
Opens an interactive AST inspector for the current file.

### `IX: Grow Selection` (`Ctrl+Alt+Up`)
Expands selection to the next syntax node using tree-sitter.

## Library API

When installed as a package, ixdar-vs exposes the following modules:

### `ixdar-vs/command`
```typescript
import { CommandModuleImpl } from "ixdar-vs/command";
import type { CommandModule, McpResult } from "ixdar-vs/command";
```

### `ixdar-vs/commandRegistry`
```typescript
import { CommandRegistry, RegisterCommand } from "ixdar-vs/commandRegistry";
```

### `ixdar-vs/mcp`
```typescript
import * as mcp from "ixdar-vs/mcp";
```

### `ixdar-vs/strings`
```typescript
import * as strings from "ixdar-vs/strings";
```

### `ixdar-vs/availability`
```typescript
import { runWithAvailabilityGuard } from "ixdar-vs/availability";
```

### `ixdar-vs/fs`
```typescript
import * as fs from "ixdar-vs/fs";
```

## MCP Server Integration

All registered commands (both built-in and `.ix/` commands) are automatically exposed via MCP, allowing AI assistants to:
- List available commands with `list_commands`
- Execute commands by name with `execute_command`
- Access command metadata and input schemas
- Invoke workspace-specific `.ix/` commands remotely


## Requirements

- **VS Code**: 1.97.0 or higher
- **Node.js**: For MCP server and `.ix/` command compilation
- **TypeScript**: For developing custom commands

## Extension Settings

### MCP Configuration
* `ixdar-vs.mcp.enabled`: Enable/disable the MCP server (default: `true`)
* `ixdar-vs.mcp.transport`: Transport type - `stdio` or `http` (default: `stdio`)
* `ixdar-vs.mcp.httpPort`: Port number for HTTP transport (default: `45555`)

### AI Configuration
* `ixdar-vs.ai.provider`: AI provider for code generation - `gemini`, `openai`, or `anthropic`
* `ixdar-vs.ai.model`: Model name to use
* `ixdar-vs.ai.apiKey`: API key for the selected provider

## Installation

### As a VS Code Extension
```bash
# Install from VSIX
code --install-extension ixdar-vs-0.0.26.vsix
```

### As a Library
```bash
npm install ixdar-vs
```

## Quick Start

1. **Create a `.ix/` workspace:**
   - Open the command palette (`Ctrl+Shift+P`)
   - Run `IX: Make Template From File`
   - This creates `.ix/` with `package.json`, `tsconfig.json`, and `.gitignore`

2. **Install dependencies:**
   ```bash
   cd .ix
   npm install
   ```

3. **Create your first command:**
   - Run `IX: New Ixdar Command`
   - Or manually create a `.ts` file in `.ix/`

4. **Reload VS Code:**
   - Your command is automatically compiled and registered
   - Access it via `IX: Ixdar Command` or the command palette

## Development

### Project Structure

```
ixdar-vs/
├── src/
│   ├── extension.ts              # VS Code extension entry point
│   ├── index.ts                  # Library entry point
│   ├── types/
│   │   └── command.ts           # CommandModule interfaces
│   └── utils/
│       ├── command/             # Command registry and loading
│       ├── ai/                  # MCP server integration
│       ├── templating/          # String and template utilities
│       └── vscode/              # VS Code API wrappers
├── lib/                          # Compiled library output (tsc)
├── out/                          # Webpack bundle for VS Code
└── .ix/                          # Your workspace commands
```

### Building

```bash
# Install dependencies
npm install

# Build library + extension
npm run build

# Build library only (tsc)
npm run build:lib

# Build extension only (webpack)
npm run build:webpack

# Development mode with watch
npm run watch
```

### Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Launch extension in debug mode
Press F5 in VS Code
```

### Publishing

```bash
# Package the extension
npm run package

# This creates ixdar-vs-x.x.x.vsix
```

## How `.ix/` Commands Are Loaded

1. **Discovery**: Scans workspace folders for `.ix/` directories
2. **Compilation**: Uses TypeScript Compiler API with custom module resolution
3. **Module Resolution**:
   - Checks `.ix/node_modules/` for packages like `ixdar-vs`
   - Checks workspace `node_modules/` as fallback
   - Uses `__non_webpack_require__` to bypass webpack bundling
4. **Sandboxing**: Executes in `vm.Context` with controlled `require()` function
5. **Registration**: Commands are registered with both VS Code and MCP server

## Architecture Decisions

### Why Dual-Build?

- **VS Code** expects a single bundled entry point for fast loading
- **Library consumers** need individual modules for tree-shaking and subpath imports
- **Solution**: tsc compiles to `lib/`, webpack bundles to `out/`

### Why VM Sandbox?

- Allows runtime TypeScript compilation without affecting the extension
- Provides controlled module resolution (extension vs. child workspace node_modules)
- Isolates command execution from extension code

### Why MCP?

- Enables AI assistants to discover and use commands
- Provides structured interface for command invocation
- Allows remote workspace manipulation through Claude, Cursor, etc.

## Troubleshooting

### Commands not loading from `.ix/`
- Check that `npm install` has been run in `.ix/`
- Verify `ixdar-vs` is in `.ix/node_modules/`
- Check VS Code Developer Console for compilation errors

### Module resolution errors
- Ensure `.ix/tsconfig.json` extends the parent config
- Verify `baseUrl` and `paths` are set correctly
- Check that subpath imports match package.json `exports`

### MCP server not responding
- Verify `ixdar-vs.mcp.enabled` is `true`
- Check that MCP client is configured with correct transport
- For `stdio`, ensure no other output to stdout/stdin

## Contributing

Contributions are welcome! This project is designed to be extended:

1. **Add built-in commands**: Create files in `src/commands/`
2. **Extend library API**: Export new utilities in `src/index.ts`
3. **Improve command loading**: Enhance `src/utils/command/loadCommand.ts`
4. **Add MCP tools**: Register new tools in MCP server initialization

## License

See [LICENSE.MD](LICENSE.MD)

## Links

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)

---

**Built with ❤️ for recursive, self-extending development workflows**
