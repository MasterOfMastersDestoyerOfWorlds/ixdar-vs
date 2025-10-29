import type { CommandModule } from "@/types/command";

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
    console.log(`Registered command: ${command.vscodeCommand.id}`);
  }

  /**
   * Get all registered commands
   */
  getAll(): CommandModule[] {
    return [...this.commands];
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
export function RegisterCommand<T extends { new(...args: any[]): any }>(constructor: T): T {
  // Access the static default property which holds the command
  const cmd = (constructor as any).default;
  
  if (cmd) {
    CommandRegistry.getInstance().register(cmd);
  } else {
    console.warn("@RegisterCommand decorator: command not found on class.default");
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

