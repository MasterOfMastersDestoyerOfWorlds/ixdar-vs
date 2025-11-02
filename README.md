# ixdar-vs

IDE tooling for the ixdar project with Model Context Protocol (MCP) support.

## Features

This VS Code extension provides developer tools and utilities with full MCP server integration, allowing AI assistants like Claude to interact with your VS Code workspace.

### Commands

#### 1. **IX: zBreakPoint** (`Ctrl+Shift+B`)
Insert a conditional z_breakpoint snippet at the current cursor position. This creates a conditional block with a breakpoint, useful for debugging shader code or other conditional debugging scenarios.

```glsl
if(){
    float z_breakPoint = 0;
}
```

#### 2. **IX: Insert Definition Shortcode** (`Ctrl+Shift+D`)
Available in Markdown files only. This command:
- Takes the word at the cursor or selected text
- Fetches a Wikipedia summary for that term
- Creates a definition file in `web/static/definitions/`
- Inserts a Hugo shortcode `{{< def "term" >}}` at the cursor position

Perfect for creating rich, interactive documentation with automatic term definitions.

### Template Workspace

- `IX: Make Template From File` now scaffolds a `.ix/` workspace containing a `tsconfig.json` that extends the project configuration (including the `@/` path aliases) and a `package.json` that depends on the published `ixdar-vs` npm package. Templates created in `.ix/` can immediately import project utilities or package exports without extra configuration.

### Module Metadata

- Every module compiled from `src/` has a `__modulePath` export injected by a custom webpack loader. You can access it directly or use the `getModulePath` utility:

```typescript
import * as strings from "@/utils/strings";
import { getModulePath } from "@/utils/importer";

console.log(strings.__modulePath); // "/utils/strings"
console.log(getModulePath(strings)); // "/utils/strings"
```

### MCP Server Integration

This extension exposes all its commands via the Model Context Protocol, enabling AI assistants to:
- List available VS Code commands
- Insert breakpoints programmatically
- Create definition shortcodes from AI conversations
- Execute any VS Code command remotely


## Requirements

- VS Code 1.97.0 or higher
- Node.js (for MCP server functionality)

## Extension Settings

This extension contributes the following settings:

* `ixdar-vs.mcp.enabled`: Enable/disable the MCP server (default: `true`)
* `ixdar-vs.mcp.transport`: Transport type for MCP server - `stdio` or `http` (default: `stdio`)
* `ixdar-vs.mcp.httpPort`: Port number for HTTP transport (default: `45555`)

## MCP Tools Available

When the MCP server is enabled, the following tools are exposed:

1. **list_commands** - List all VS Code commands with a given prefix
2. **insert_z_breakpoint** - Insert a z_breakpoint snippet at cursor
3. **insert_definition_shortcode** - Insert a definition shortcode for Markdown
4. **execute_vscode_command** - Execute any VS Code command by ID

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

Press `F5` in VS Code to launch the extension in debug mode.


## Release Notes

### 0.0.1

Initial release with:
- z_breakpoint insertion command
- Definition shortcode command for Markdown
- Full MCP server integration with configurable transport
- Support for both stdio and HTTP/SSE transports

---

## Links

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP Server Setup Guide](MCP-README.md)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

**Enjoy!**
