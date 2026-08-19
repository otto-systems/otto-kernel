export function edsScan(input?: { workspaceRoot?: string }): Promise<any>;
export function edsGetRegistry(input?: { workspaceRoot?: string }): Promise<any>;
export function edsGetExtension(input?: { workspaceRoot?: string; name?: string; extension?: string }): Promise<any>;
export function executeEdsCommand(commandName: string, input?: Record<string, unknown>): Promise<any>;
