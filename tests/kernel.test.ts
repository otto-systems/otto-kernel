import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCommandEnvelope, createModuleManifest } from "@otto/protocol";

import { CommandRouter, Kernel, ModuleLoader, runEdsGetExtension, runEdsGetRegistry, runEdsScan } from "../src/index.js";

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

describe("EDS", () => {
  it("scans workspace and returns unified registry", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "otto-eds-"));
    const moduleRoot = path.join(tempRoot, "modules", "sample-extension");
    const contractsRoot = path.join(moduleRoot, "contracts");
    const manifestsRoot = path.join(moduleRoot, "manifests");

    await mkdir(contractsRoot, { recursive: true });
    await mkdir(manifestsRoot, { recursive: true });

    await writeFile(
      path.join(moduleRoot, "package.json"),
      JSON.stringify({ name: "sample-extension", version: "1.2.3", dependencies: { lodash: "^4.0.0" } }, null, 2)
    );
    await writeFile(
      path.join(contractsRoot, "commands.json"),
      JSON.stringify({ commands: [{ id: "sample.run" }] }, null, 2)
    );
    await writeFile(
      path.join(contractsRoot, "api.json"),
      JSON.stringify({ endpoints: [{ method: "GET", route: "/sample", command: "sample.run" }] }, null, 2)
    );
    await writeFile(
      path.join(manifestsRoot, "extension.json"),
      JSON.stringify({ id: "sample.extension", name: "Sample Extension", version: "1.2.3", capabilities: ["sample"] }, null, 2)
    );

    const scan = await runEdsScan({ workspaceRoot: tempRoot });
    expect(scan.ok).toBe(true);
    expect(scan.extensionCount).toBeGreaterThan(0);

    const registry = await runEdsGetRegistry({ workspaceRoot: tempRoot });
    expect(registry.extensionCount).toBeGreaterThan(0);

    const extension = await runEdsGetExtension({ workspaceRoot: tempRoot, name: "sample-extension" });
    expect(extension.found).toBe(true);
    expect(extension.extension.version).toBe("1.2.3");
  });
});
