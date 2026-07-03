import type { CommandEnvelope } from "@otto/protocol";
import type { CommandHandler } from "./types.js";

export class CommandRouter {
  private readonly handlers = new Map<string, CommandHandler>();

  register(commandName: string, handler: CommandHandler): void {
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
