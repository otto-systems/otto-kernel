import { executeEdsCommand, type EdsGetExtensionInput, type EdsGetRegistryInput, type EdsScanInput } from "./eds-service.js";

export const EDS_SCAN_COMMAND = "eds.scan";
export const EDS_GET_REGISTRY_COMMAND = "eds.get.registry";
export const EDS_GET_EXTENSION_COMMAND = "eds.get.extension";
export const EDS_GET_EXTENSION_PATTERN_COMMAND = "eds.get.extension.<name>";

export async function runEdsScan(input: EdsScanInput = {}): Promise<any> {
  return executeEdsCommand(EDS_SCAN_COMMAND, input as Record<string, unknown>);
}

export async function runEdsGetRegistry(input: EdsGetRegistryInput = {}): Promise<any> {
  return executeEdsCommand(EDS_GET_REGISTRY_COMMAND, input as Record<string, unknown>);
}

export async function runEdsGetExtension(input: EdsGetExtensionInput = {}): Promise<any> {
  return executeEdsCommand(EDS_GET_EXTENSION_COMMAND, input as Record<string, unknown>);
}
