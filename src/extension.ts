import * as vscode from "vscode";
import * as http from "http";
import { CommandModuleImpl, type CommandModule } from "@/types/command";
import {
  getActiveRepoName,
  getActiveLanguageId,
  isAvailable,
  isAvailableForListing,
} from "@/utils/availability";
import * as parser from "@/utils/parser";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as fs from "@/utils/fs";

export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "ixdar-vs" mcp is now active!');

  const commandContext = require.context("./commands", true, /\.ts$/);
  commandContext.keys().forEach((key: string) => {
    commandContext(key);
  });
  const { CommandRegistry } = await import("./utils/commandRegistry");

  await fs.loadWorkspaceCommands();

  const commandModules = CommandRegistry.getInstance().getAll();
  console.log(`Loaded ${commandModules.length} command modules from registry`);

  for (const cmd of commandModules) {
    try {
      if (cmd && cmd.vscodeCommand && cmd.mcp) {
        const existingCommands = await vscode.commands.getCommands(true);
        if (existingCommands.includes(cmd.vscodeCommand.id)) {
          console.warn(
            `Command ${cmd.vscodeCommand.id} already registered, skipping.`
          );
          continue;
        }

        cmd.vscodeCommand.register(context);
        console.log(`Registered command: ${cmd.vscodeCommand.id}`);
      } else {
        console.warn(`Command missing vscodeCommand or mcp properties:`, cmd);
      }
    } catch (e) {
      console.error("Failed to register command", cmd?.vscodeCommand?.id, e);
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (parser.isLanguageSupported(event.document.languageId)) {
        parser.updateParseTree(event.document, event.contentChanges);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      parser.clearParseTree(document);
    })
  );

  const config = vscode.workspace.getConfiguration("ixdar-vs");
  const mcpEnabled = config.get<boolean>("mcp.enabled", true);

  if (!mcpEnabled) {
    console.log("MCP server is disabled in settings");
    return;
  }

  const transportType = config.get<string>("mcp.transport", "stdio");
  const httpPort = config.get<number>("mcp.httpPort", 45555);

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
    dynamicTools.set(cmd.name, cmd);
  }

  mcp.setRequestHandler(ListToolsRequestSchema, async () => {
    const repoName = await getActiveRepoName();
    const langId = getActiveLanguageId();
    const dynamic = Array.from(dynamicTools.values())
      .filter((m) => isAvailableForListing(m.meta, repoName, langId))

      .map((m) => m.mcp?.tool);
    console.log("dynamic", dynamic);
    const tools = [
      {
        name: "list_commands",
        description:
          "List VS Code commands starting with a prefix (default: ixdar-vs.)",
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
        description:
          "Execute any VS Code command by its ID. Use list_commands to see available commands.",
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
              items: { type: "string" },
            },
          },
          required: ["command"],
        },
      },
      ...dynamic,
    ];
    return { tools };
  });

  mcp.setRequestHandler(
    CallToolRequestSchema,
    async (request: any): Promise<any> => {
      try {
        switch (request.params.name) {
          case "list_commands": {
            const prefix =
              (request.params.arguments?.prefix as string) ?? "ixdar-vs.";
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
                    message: `Executed command: ${commandId}`,
                  }),
                },
              ],
            };
          }

          default: {
            const toolName = request.params.name as string;
            const mod = dynamicTools.get(toolName);
            if (!mod || !mod.mcp) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error: `Unknown tool: ${toolName}`,
                    }),
                  },
                ],
                isError: true,
              };
            }
            const repoName = await getActiveRepoName();
            const langId = getActiveLanguageId();
            if (!isAvailable(mod.meta, repoName, langId)) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error:
                        "Tool not available in this repository or language",
                    }),
                  },
                ],
                isError: true,
              };
            }
            const validation = CommandModuleImpl.isValidRequest(
              request.params.arguments,
              mod.mcp.tool.inputSchema
            );
            if (!validation.valid) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error: validation.errors.join(", "),
                    }),
                  },
                ],
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
                error: error.message ?? "Unknown error occurred",
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  let transport: any;
  let httpServer: http.Server | undefined;

  if (transportType === "http") {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    httpServer = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      let body: any = undefined;
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyText = Buffer.concat(chunks).toString("utf-8");
        try {
          body = JSON.parse(bodyText);
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }
      }

      try {
        await transport.handleRequest(req, res, body);
      } catch (error: any) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      httpServer!.listen(httpPort, "127.0.0.1", () => {
        console.log(
          `MCP server (HTTP/SSE) listening on http://127.0.0.1:${httpPort}`
        );
        resolve();
      });
      httpServer!.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
          const message =
            `Port ${httpPort} is already in use. Please either:\n` +
            `1. Stop the process using that port, or\n` +
            `2. Change the port in settings: ixdar-vs.mcp.httpPort\n` +
            `3. Disable MCP server in settings: ixdar-vs.mcp.enabled`;
          vscode.window.showErrorMessage(message);
          console.error(message);
          resolve();
        } else {
          reject(error);
        }
      });
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

export function deactivate() {}
