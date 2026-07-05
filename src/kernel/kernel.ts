import { CommandRouter } from "./commandRouter.js";
import { ModuleLoader } from "./moduleLoader.js";
import { loadCommandSchemas } from "@otto/command-service";
import type { KernelModule, KernelState } from "./types.js";

export class Kernel {
  readonly modules: ModuleLoader;
  readonly commands: CommandRouter;

  constructor(state?: Partial<KernelState>) {
    this.modules = new ModuleLoader();
    this.commands = new CommandRouter();

    state?.modules?.forEach((module) => this.modules.register(module));
    state?.commands?.forEach((handler, commandName) => this.commands.register(commandName, handler));
  }

  async registerModule(module: KernelModule): Promise<void> {
    this.modules.register(module);
    await module.initialize();
  }

  async syncCommandSchemas(): Promise<void> {
    const schemas = await loadCommandSchemas();
    this.commands.setAllowedCommands(schemas.map((schema) => schema.name));
  }
}
