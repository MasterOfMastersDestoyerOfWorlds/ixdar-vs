// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { registerInsertDefinitionCommand } from "./commands/insertDefinition";
import * as http from "http";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "ixdar-vs" mcp is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "ixdar-vs.onZBreakPoint",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        return;
      }
      const position = editor.selection.active;
      const snippet = new vscode.SnippetString();
      snippet.appendText("if(");
      snippet.appendTabstop();
      snippet.appendText(`){\n` + `\tfloat z_breakPoint = 0;\n` + `}`);
      editor.insertSnippet(snippet, position);
      const breakline = editor.document.lineAt(position.line + 1);
      const breakpoint = new vscode.SourceBreakpoint(
        new vscode.Location(editor.document.uri, breakline.range)
      );
      // Add the breakpoint
      vscode.debug.addBreakpoints([breakpoint]);
      vscode.window.showInformationMessage("Breakpoint Set");
    }
  );

  context.subscriptions.push(disposable);

  // Register: Insert Definition Shortcode for Markdown
  registerInsertDefinitionCommand(context);

  // Check if MCP server is enabled
  const config = vscode.workspace.getConfiguration('ixdar-vs');
  const mcpEnabled = config.get<boolean>('mcp.enabled', true);
  
  if (!mcpEnabled) {
    console.log('MCP server is disabled in settings');
    return;
  }

  const transportType = config.get<string>('mcp.transport', 'stdio');
  const httpPort = config.get<number>('mcp.httpPort', 45555);

  const sdkServer: any = await import("@modelcontextprotocol/sdk/server/index.js");
  const sdkTypes: any = await import("@modelcontextprotocol/sdk/types.js");

  const { Server } = sdkServer;
  const { StdioServerTransport } = sdkTypes;

  const mcp = new Server(
    {
      name: "ixdar-tools",
      version: "0.0.1",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Tool: list_commands - List all VS Code commands with a given prefix
  mcp.setRequestHandler(sdkTypes.ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_commands",
          description: "List VS Code commands starting with a prefix (default: ixdar-vs.)",
          inputSchema: {
            type: "object",
            properties: {
              prefix: {
                type: "string",
                description: "Command prefix to filter by",
                default: "ixdar-vs.",
              },
            },
          },
        },
        {
          name: "insert_z_breakpoint",
          description: "Insert a z_breakpoint snippet at the current cursor position. Creates a conditional block with a breakpoint.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "insert_definition_shortcode",
          description: "Insert a definition shortcode for the word at cursor in a Markdown file. Fetches Wikipedia summary and creates a Hugo shortcode.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "execute_vscode_command",
          description: "Execute any VS Code command by its ID. Use list_commands to see available commands.",
          inputSchema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "The VS Code command ID to execute",
              },
              args: {
                type: "array",
                description: "Optional arguments to pass to the command",
                items: {
                  type: "string",
                },
              },
            },
            required: ["command"],
          },
        },
      ],
    };
  });

  // Tool execution handler
  mcp.setRequestHandler(sdkTypes.CallToolRequestSchema, async (request: any) => {
    try {
      switch (request.params.name) {
        case "list_commands": {
          const prefix = (request.params.arguments?.prefix as string) ?? "ixdar-vs.";
          const allCommands = await vscode.commands.getCommands(true);
          const filtered = allCommands.filter((id) => id.startsWith(prefix));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ commands: filtered }, null, 2),
              },
            ],
          };
        }

        case "insert_z_breakpoint": {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "No active text editor" }),
                },
              ],
              isError: true,
            };
          }
          await vscode.commands.executeCommand("ixdar-vs.onZBreakPoint");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, message: "Z breakpoint inserted" }),
              },
            ],
          };
        }

        case "insert_definition_shortcode": {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "No active text editor" }),
                },
              ],
              isError: true,
            };
          }
          if (editor.document.languageId !== "markdown") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ 
                    error: "Definition shortcode can only be inserted in Markdown files" 
                  }),
                },
              ],
              isError: true,
            };
          }
          await vscode.commands.executeCommand("ixdar-vs.insertDefinitionShortcode");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  success: true, 
                  message: "Definition shortcode inserted" 
                }),
              },
            ],
          };
        }

        case "execute_vscode_command": {
          const commandId = request.params.arguments?.command as string;
          const args = (request.params.arguments?.args as any[]) ?? [];
          if (!commandId) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "Command ID is required" }),
                },
              ],
              isError: true,
            };
          }
          await vscode.commands.executeCommand(commandId, ...args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  success: true, 
                  message: `Executed command: ${commandId}` 
                }),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Unknown tool: ${request.params.name}` }),
              },
            ],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ 
              error: error.message ?? "Unknown error occurred" 
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Start the MCP server with the configured transport
  let transport: any;
  let httpServer: http.Server | undefined;
  
  if (transportType === 'http') {
    const sdkHttp: any = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const { StreamableHTTPServerTransport } = sdkHttp;
    
    // Create the transport
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });
    
    // Create HTTP server
    httpServer = http.createServer(async (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      // Parse request body for POST requests
      let body: any = undefined;
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyText = Buffer.concat(chunks).toString('utf-8');
        try {
          body = JSON.parse(bodyText);
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
      }
      
      // Handle the request with the transport
      try {
        await transport.handleRequest(req, res, body);
      } catch (error: any) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      }
    });
    
    // Start listening
    await new Promise<void>((resolve, reject) => {
      httpServer!.listen(httpPort, '127.0.0.1', () => {
        console.log(`MCP server (HTTP/SSE) listening on http://127.0.0.1:${httpPort}`);
        resolve();
      });
      httpServer!.on('error', reject);
    });
    
  } else {
    transport = new StdioServerTransport();
    console.error("MCP server (stdio) started for ixdar-tools");
  }
  
  await mcp.connect(transport);
  
  context.subscriptions.push({
    dispose: async () => {
      try {
        if (httpServer) {
          httpServer.close();
        }
        await mcp.close();
      } catch (error) {
        console.error("Error closing MCP server:", error);
      }
    },
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
