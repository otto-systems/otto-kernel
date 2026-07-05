import type { CommandEnvelope } from "@otto/protocol";
import type { CommandHandler } from "./types.js";

export class CommandRouter {
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly allowedCommands = new Set<string>();

  setAllowedCommands(commandNames: readonly string[]): void {
    this.allowedCommands.clear();
    for (const commandName of commandNames) {
      this.allowedCommands.add(commandName);
    }
  }

  register(commandName: string, handler: CommandHandler): void {
    if (this.allowedCommands.size > 0 && !this.allowedCommands.has(commandName)) {
      throw new Error(`Command is not declared in standalone command-service schemas: ${commandName}`);
    }
    this.handlers.set(commandName, handler);
  }

  async route(command: CommandEnvelope): Promise<unknown> {
    const handler = this.handlers.get(command.command);
    if (!handler) {
      throw new Error(`No handler registered for command: ${command.command}`);
    }

    return handler(command);
  }
}
