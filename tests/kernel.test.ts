import { describe, expect, it, vi } from "vitest";
import { createCommandEnvelope, createModuleManifest } from "@otto/protocol";

import { CommandRouter, Kernel, ModuleLoader } from "../src/index.js";

describe("ModuleLoader", () => {
  it("registers and returns modules", () => {
    const loader = new ModuleLoader();
    const module = {
      manifest: createModuleManifest({ id: "ext.sync" }),
      initialize: vi.fn()
    };

    loader.register(module);

    expect(loader.get("ext.sync")).toBe(module);
    expect(loader.list()).toContain(module);
  });
});

describe("CommandRouter", () => {
  it("routes registered commands", async () => {
    const router = new CommandRouter();
    router.register("kernel.reload", () => "ok");

    await expect(router.route(createCommandEnvelope())).resolves.toBe("ok");
  });

  it("throws for unknown commands", async () => {
    const router = new CommandRouter();

    await expect(router.route(createCommandEnvelope({ command: "missing.command" }))).rejects.toThrow(
      "No handler registered"
    );
  });
});

describe("Kernel", () => {
  it("initializes module on registration", async () => {
    const kernel = new Kernel();
    const initialize = vi.fn();

    await kernel.registerModule({
      manifest: createModuleManifest({ id: "ext.audit" }),
      initialize
    });

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(kernel.modules.get("ext.audit")).toBeDefined();
  });
});
