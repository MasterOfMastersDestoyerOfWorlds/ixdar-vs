# MCP Server for ixdar-vs Extension

This VS Code extension exposes its commands via the Model Context Protocol (MCP), allowing AI assistants like Claude to interact with your VS Code workspace.

## Features

The MCP server exposes the following tools:

### 1. `list_commands`
List all VS Code commands that start with a given prefix (default: "ixdar-vs.")

**Input:**
```json
{
  "prefix": "ixdar-vs."  // optional
}
```

**Output:**
```json
{
  "commands": ["ixdar-vs.onZBreakPoint", "ixdar-vs.insertDefinitionShortcode"]
}
```

### 2. `insert_z_breakpoint`
Insert a z_breakpoint snippet at the current cursor position. This creates a conditional block with a breakpoint for debugging.

**Input:** None required

**Output:**
```json
{
  "success": true,
  "message": "Z breakpoint inserted"
}
```

### 3. `insert_definition_shortcode`
Insert a definition shortcode for the word at cursor in a Markdown file. This command:
- Fetches a Wikipedia summary for the selected word
- Creates a definition file in `web/static/definitions/`
- Inserts a Hugo shortcode `{{< def "term" >}}` at the cursor position

**Input:** None required (uses word at cursor)

**Output:**
```json
{
  "success": true,
  "message": "Definition shortcode inserted"
}
```

### 4. `execute_vscode_command`
Execute any VS Code command by its ID with optional arguments.

**Input:**
```json
{
  "command": "workbench.action.files.save",
  "args": []  // optional
}
```

**Output:**
```json
{
  "success": true,
  "message": "Executed command: workbench.action.files.save"
}
```

## Using with Claude Desktop

To use this MCP server with Claude Desktop, you need to configure it in your Claude Desktop config file.

### Configuration

The MCP server uses **stdio transport**, which means it communicates via standard input/output. Since VS Code extensions need to run within VS Code, you have two options:

#### Option 1: Direct Extension Integration (Recommended)

The extension automatically starts the MCP server when activated. However, Claude Desktop can't directly connect to it since it runs inside VS Code.

#### Option 2: HTTP/SSE Transport (For Remote Access)

If you need Claude Desktop or other MCP clients to access the MCP server remotely, you can configure the extension to use HTTP with Server-Sent Events (SSE):

1. Open VS Code Settings (File > Preferences > Settings or Ctrl+,)
2. Search for "ixdar-vs"
3. Change the following settings:
   - **MCP: Transport**: Set to `http`
   - **MCP: Http Port**: Set to your desired port (default: 45555)
4. Reload VS Code (Developer: Reload Window)

The extension will now expose an HTTP endpoint at `http://127.0.0.1:45555`.

### Claude Desktop Configuration

Add this to your `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "ixdar-tools": {
      "url": "http://127.0.0.1:45555/sse",
      "transport": "sse"
    }
  }
}
```

Or for stdio transport (if running as a standalone process):

```json
{
  "mcpServers": {
    "ixdar-tools": {
      "command": "node",
      "args": [
        "C:\\Code\\ixdar-vs\\out\\extension.js"
      ]
    }
  }
}
```

Note: The stdio configuration won't work directly because the extension needs VS Code context to execute commands.

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

1. Open VS Code
2. Press F5 to launch the extension in debug mode
3. Check the Debug Console for "MCP server (stdio) started for ixdar-tools"
4. The MCP server is now running and accessible to tools that can connect to it

### Adding New Tools

To add a new tool to the MCP server:

1. Add the tool definition in the `ListToolsRequestSchema` handler
2. Add the tool execution logic in the `CallToolRequestSchema` handler
3. Recompile and reload the extension

Example:

```typescript
// In ListToolsRequestSchema handler
{
  name: "my_new_tool",
  description: "Description of what this tool does",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Description of param1",
      },
    },
    required: ["param1"],
  },
}

// In CallToolRequestSchema handler
case "my_new_tool": {
  const param1 = request.params.arguments?.param1 as string;
  // Your tool logic here
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true }),
      },
    ],
  };
}
```

## Troubleshooting

### MCP server not starting

Check the VS Code Output panel (View > Output) and select "Extension Host" to see any error messages.

### Commands failing

Make sure:
1. The extension is activated (open any file to trigger activation)
2. For editor-specific commands, an editor window is active
3. For Markdown commands, a Markdown file is open

### Logging

The extension uses `console.error()` for logging to avoid interfering with stdio communication. Check the Debug Console when running in debug mode.

## References

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP SDK for Node.js](https://github.com/modelcontextprotocol/typescript-sdk)
- [Building MCP Servers Guide](https://modelcontextprotocol.io/docs/develop/build-server)

