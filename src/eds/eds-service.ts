export interface EdsScanInput {
  workspaceRoot?: string;
}

export interface EdsGetRegistryInput {
  workspaceRoot?: string;
}

export interface EdsGetExtensionInput {
  workspaceRoot?: string;
  name?: string;
  extension?: string;
}

async function runtime() {
  // @ts-expect-error Runtime bridge module is JavaScript-only by design.
  return import("./eds-runtime.mjs");
}

export async function edsScan(input: EdsScanInput = {}): Promise<any> {
  const mod = await runtime();
  return mod.edsScan(input);
}

export async function edsGetRegistry(input: EdsGetRegistryInput = {}): Promise<any> {
  const mod = await runtime();
  return mod.edsGetRegistry(input);
}

export async function edsGetExtension(input: EdsGetExtensionInput = {}): Promise<any> {
  const mod = await runtime();
  return mod.edsGetExtension(input);
}

export async function executeEdsCommand(commandName: string, input: Record<string, unknown> = {}): Promise<any> {
  const mod = await runtime();
  return mod.executeEdsCommand(commandName, input);
}
