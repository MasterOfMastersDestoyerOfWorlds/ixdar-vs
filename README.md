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

### MCP Server Integration

This extension exposes all its commands via the Model Context Protocol, enabling AI assistants to:
- List available VS Code commands
- Insert breakpoints programmatically
- Create definition shortcodes from AI conversations
- Execute any VS Code command remotely

See [MCP-README.md](MCP-README.md) for detailed MCP server documentation and setup instructions.

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

## Usage with Claude Desktop

To use this extension with Claude Desktop:

1. Install and activate the extension in VS Code
2. Enable HTTP transport in settings:
   - Open Settings (`Ctrl+,`)
   - Search for "ixdar-vs"
   - Set `MCP: Transport` to `http`
3. Configure Claude Desktop (see [MCP-README.md](MCP-README.md) for details)
4. Reload VS Code

Claude will now be able to interact with your VS Code instance!

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

Press `F5` in VS Code to launch the extension in debug mode.

### Adding MCP Tools

See [MCP-README.md](MCP-README.md) for instructions on adding new MCP tools.

## Known Issues

- MCP stdio transport requires the extension to run within VS Code context
- Definition shortcode requires internet connection to fetch Wikipedia data
- HTTP transport may require firewall permissions

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
