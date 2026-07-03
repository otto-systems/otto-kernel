import type { CommandEnvelope, ModuleManifest } from "@otto/protocol";

export type KernelModule = {
  manifest: ModuleManifest;
  initialize: () => Promise<void> | void;
  shutdown?: () => Promise<void> | void;
};

export type CommandHandler = (command: CommandEnvelope) => Promise<unknown> | unknown;

export type KernelState = {
  modules: Map<string, KernelModule>;
  commands: Map<string, CommandHandler>;
};
