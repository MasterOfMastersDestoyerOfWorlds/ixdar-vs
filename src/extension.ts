// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import type { CommandModule } from "./types/command";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "ixdar-vs" mcp is now active!');

  // Dynamically discover and register all command modules (single source of truth)
  const commandModules: CommandModule[] = [];
  try {
    const commandsDir = path.join(__dirname, "commands");
    if (fs.existsSync(commandsDir)) {
      const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js") && !f.endsWith(".js.map"));
      for (const file of files) {
        try {
          const modPath = path.join(commandsDir, file);
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const loaded = require(modPath);
          const cmd: CommandModule | undefined = loaded?.default;
          if (cmd && cmd.vscode && cmd.mcp) {
            commandModules.push(cmd);
            cmd.vscode.register(context);
          } else {
            console.warn(`File ${file} did not export a CommandModule as default.`);
          }
        } catch (e) {
          console.error("Failed to load command module", file, e);
        }
      }
    } else {
      console.warn("Commands directory not found:", commandsDir);
    }
  } catch (e) {
    console.error("Error discovering command modules:", e);
  }

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

  const dynamicTools = new Map<string, CommandModule>();
  for (const cmd of commandModules) {
    dynamicTools.set(cmd.mcp.tool.name, cmd);
  }

  mcp.setRequestHandler(sdkTypes.ListToolsRequestSchema, async () => {
    const tools = [
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
        name: "execute_vscode_command",
        description: "Execute any VS Code command by its ID. Use list_commands to see available commands.",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The VS Code command ID to execute" },
            args: { type: "array", description: "Optional arguments to pass to the command", items: { type: "string" } },
          },
          required: ["command"],
        },
      },
      ...Array.from(dynamicTools.values()).map((m) => m.mcp.tool),
    ];
    return { tools };
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
        
        default: {
          const toolName = request.params.name as string;
          const mod = dynamicTools.get(toolName);
          if (!mod) {
            return {
              content: [ { type: "text", text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) } ],
              isError: true,
            };
          }
          return await mod.mcp.call(request.params.arguments ?? {});
        }
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
