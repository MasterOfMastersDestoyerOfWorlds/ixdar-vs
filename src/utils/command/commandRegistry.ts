import {
  CommandModule,
  McpResult,
} from "@/types/command/commandModule";
import { createInputPlan } from "@/types/command/CommandInputPlan";
import * as vscode from "vscode";

/**
 * @ix-module-description Singleton registry for command modules. Use this to register commands with 
 * @RegisterCommand decorator, query registered commands, and execute commands programmatically.
 */

/**
 * Singleton registry for command modules.
 * Commands register themselves using the @RegisterCommand decorator.
 */
export class CommandRegistry {
  private static instance: CommandRegistry;
  private commands: CommandModule[] = [];

  private constructor() {}

  /**
   * Get the singleton instance of the CommandRegistry
   */
  static getInstance(): CommandRegistry {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry();
    }
    return CommandRegistry.instance;
  }

  /**
   * Register a command module
   */
  register(command: CommandModule): void {
    if (!command) {
      console.warn("Attempted to register null or undefined command");
      return;
    }
    if (!command.vscodeCommand || !command.mcp) {
      console.warn("Command missing vscodeCommand or mcp properties:", command);
      return;
    }
    this.commands.push(command);
  }

  /**
   * Get all registered commands
   */
  getAll(): CommandModule[] {
    return [...this.commands];
  }

  /**
   * Get all registered commands
   */
  getAllIxCommands(): CommandModule[] {
    return [...this.commands.filter((cmd) => cmd.mcp !== undefined)];
  }

  /**
   * Clear all registered commands (useful for testing)
   */
  clear(): void {
    this.commands = [];
  }
}

/**
 * Decorator to automatically register a command module with the registry.
 * Usage: Apply to a class that wraps the command export
 *
 * @example
 * @RegisterCommand
 * class Cmd {
 *   static default = command;
 * }
 */
export function RegisterCommand<T extends { new (...args: any[]): any }>(
  constructor: T
): T {
  const cmd = (constructor as any).default;

  if (cmd) {
    CommandRegistry.getInstance().register(cmd);
  } else {
    console.warn(
      "@RegisterCommand decorator: command not found on class.default"
    );
  }

  return constructor;
}

/**
 * Helper function to register and return a command module.
 * Simpler alternative to decorator pattern.
 *
 * @example
 * export default registerCommand(command);
 */
export function registerCommand(command: CommandModule): CommandModule {
  CommandRegistry.getInstance().register(command);
  return command;
}

export interface CommandQuickPickItem extends vscode.QuickPickItem {
  commandModule: CommandModule;
}

export async function getVscodeCommandQuickPickItems(): Promise<
  CommandQuickPickItem[]
> {
  const vscodeCommands = await vscode.commands.getCommands(true);
  const commonVSCodeCommands = vscodeCommands.filter(
    (cmd) =>
      cmd.startsWith("editor.action.") ||
      cmd.startsWith("workbench.action.") ||
      cmd.startsWith("extension.")
  );
  return commonVSCodeCommands.map((cmd) => ({
    label: `${cmd}`,
    description: "VS Code command",
    detail: "Built-in VS Code Command",
    commandModule: {
      name: cmd,
      description: "VS Code command",
      meta: {
        category: "general",
      },
      vscodeCommand: { id: cmd, register: () => {} },
      pipeline: {
        input: () => createInputPlan().build(),
        execute: async () => undefined,
      },
      mcp: {
        enabled: false,
        tool: {
          description: "VS Code command",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        call: () => Promise.resolve(new McpResult()),
      },
    },
  }));
}

export class CommandRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandRegistryError";
  }
}

export function getIxCommandQuickPickItems(): CommandQuickPickItem[] {
  const registry = CommandRegistry.getInstance();
  const allCommands = registry.getAllIxCommands();

  if (allCommands.length === 0) {
    throw new CommandRegistryError("No commands are registered.");
  }

  const items = allCommands.map((cmd) => ({
    label: cmd.vscodeCommand.id,
    description: cmd.description,
    detail: `Category: ${cmd.meta.category}${cmd.meta.languages ? ` | Languages: ${cmd.meta.languages.join(", ")}` : ""}`,
    commandModule: cmd,
  }));
  if (items.length === 0) {
    throw new CommandRegistryError("No commands are registered.");
  }
  return items;
}

export function findCommandById(id: string): CommandModule {
  const registry = CommandRegistry.getInstance();
  const allCommands = registry.getAllIxCommands();

  const targetCommand = allCommands.find(
    (cmd) =>
      cmd.vscodeCommand.id === id ||
      cmd.vscodeCommand.id.endsWith(`.${id}`) ||
      cmd.name === id
  );

  if (!targetCommand) {
    const availableCommands = allCommands.map((cmd) => ({
      id: cmd.vscodeCommand.id,
      name: cmd.name,
      description: cmd.mcp?.tool.description,
    }));

    throw new CommandRegistryError(`Command '${id}' not found`);
  }
  return targetCommand;
}
export async function executeCommand(commandModule: CommandModule) {
  try {
    await vscode.commands.executeCommand(commandModule.vscodeCommand.id);
    vscode.window.showInformationMessage(`Executed: ${commandModule.name}`);
  } catch (error: any) {
    throw new CommandRegistryError(
      `Failed to execute command: ${error.message}`
    );
  }
}

export async function getAllCommandQuickPickItems(): Promise<
  CommandQuickPickItem[]
> {
  const vscodeItems = await getVscodeCommandQuickPickItems();
  const items = getIxCommandQuickPickItems();
  return [...vscodeItems, ...items];
}
