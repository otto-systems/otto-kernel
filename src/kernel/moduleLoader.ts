import type { KernelModule } from "./types.js";

export class ModuleLoader {
  private readonly modules = new Map<string, KernelModule>();

  register(module: KernelModule): void {
    this.modules.set(module.manifest.id, module);
  }

  get(moduleId: string): KernelModule | undefined {
    return this.modules.get(moduleId);
  }

  list(): KernelModule[] {
    return [...this.modules.values()];
  }
}
