import fs from "node:fs/promises";
import path from "node:path";

const SCAN_ROOTS = ["external/otto", "modules", "extensions"];
const REGISTRY_PATH = path.join("runtime", "extension-registry.json");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

async function listJsonFiles(directoryPath) {
  if (!(await pathExists(directoryPath))) {
    return [];
  }

  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.join(directoryPath, entry.name));
    }
  }
  return files.sort();
}

function normalizeCommandContracts(files, jsonValues) {
  const contracts = [];
  for (let i = 0; i < files.length; i += 1) {
    const parsed = jsonValues[i];
    if (!parsed) {
      continue;
    }

    if (Array.isArray(parsed.commands)) {
      for (const command of parsed.commands) {
        const id = command?.id || command?.name || command?.command;
        if (id) {
          contracts.push({ id, sourceFile: files[i] });
        }
      }
      continue;
    }

    if (typeof parsed.name === "string" || typeof parsed.id === "string") {
      contracts.push({ id: parsed.name || parsed.id, sourceFile: files[i] });
      continue;
    }

    if (Array.isArray(parsed.endpoints)) {
      for (const endpoint of parsed.endpoints) {
        if (endpoint?.command) {
          contracts.push({ id: endpoint.command, sourceFile: files[i] });
        }
      }
    }
  }

  return contracts;
}

function normalizeApiContracts(files, jsonValues) {
  const contracts = [];
  for (let i = 0; i < files.length; i += 1) {
    const parsed = jsonValues[i];
    if (!parsed || !Array.isArray(parsed.endpoints)) {
      continue;
    }

    for (const endpoint of parsed.endpoints) {
      contracts.push({
        method: endpoint.method || "GET",
        route: endpoint.route || endpoint.path || "",
        command: endpoint.command || null,
        sourceFile: files[i]
      });
    }
  }

  return contracts;
}

function detectTools(manifests, moduleJson) {
  const tools = new Set();

  if (Array.isArray(moduleJson?.tools)) {
    for (const tool of moduleJson.tools) {
      if (typeof tool === "string") {
        tools.add(tool);
      }
    }
  }

  for (const manifest of manifests) {
    if (Array.isArray(manifest?.capabilities)) {
      for (const capability of manifest.capabilities) {
        if (typeof capability === "string") {
          tools.add(capability);
        }
      }
    }
  }

  return [...tools].sort();
}

async function discoverCandidates(workspaceRoot) {
  const candidates = [];

  for (const scanRoot of SCAN_ROOTS) {
    const absoluteRoot = path.join(workspaceRoot, scanRoot);
    if (!(await pathExists(absoluteRoot))) {
      continue;
    }

    const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const extensionPath = path.join(absoluteRoot, entry.name);
      candidates.push(extensionPath);

      // One nested level keeps discovery scalable while covering common monorepo nesting.
      const nested = await fs.readdir(extensionPath, { withFileTypes: true }).catch(() => []);
      for (const nestedEntry of nested) {
        if (!nestedEntry.isDirectory() || SKIP_DIRS.has(nestedEntry.name)) {
          continue;
        }

        const nestedPath = path.join(extensionPath, nestedEntry.name);
        if (await pathExists(path.join(nestedPath, "package.json"))) {
          candidates.push(nestedPath);
        }
      }
    }
  }

  return [...new Set(candidates)].sort();
}

async function scanExtension(workspaceRoot, extensionPath) {
  const packagePath = path.join(extensionPath, "package.json");
  const modulePath = path.join(extensionPath, "module.json");
  const manifestsDir = path.join(extensionPath, "manifests");
  const contractsDir = path.join(extensionPath, "contracts");
  const commandsDir = path.join(extensionPath, "commands");

  const packageJson = await readJson(packagePath);
  const moduleJson = await readJson(modulePath);

  const manifestFiles = await listJsonFiles(manifestsDir);
  const contractFiles = await listJsonFiles(contractsDir);
  const commandFiles = await listJsonFiles(commandsDir);

  const manifestJson = await Promise.all(manifestFiles.map((filePath) => readJson(filePath)));
  const contractJson = await Promise.all(contractFiles.map((filePath) => readJson(filePath)));
  const commandJson = await Promise.all(commandFiles.map((filePath) => readJson(filePath)));

  const metadata = {
    packageJson,
    moduleJson,
    manifests: manifestJson.filter(Boolean)
  };

  const commandContracts = [
    ...normalizeCommandContracts(contractFiles, contractJson),
    ...normalizeCommandContracts(commandFiles, commandJson)
  ];
  const apiContracts = [
    ...normalizeApiContracts(contractFiles, contractJson),
    ...normalizeApiContracts(commandFiles, commandJson)
  ];

  const installFootprint = manifestJson.find((entry) => entry && entry.installFootprint)
    ? manifestJson.find((entry) => entry?.installFootprint)?.installFootprint
    : null;

  const name =
    moduleJson?.name ||
    metadata.manifests.find((entry) => typeof entry?.name === "string")?.name ||
    packageJson?.name ||
    path.basename(extensionPath);

  return {
    name,
    path: path.relative(workspaceRoot, extensionPath).replace(/\\/g, "/"),
    version:
      packageJson?.version ||
      metadata.manifests.find((entry) => typeof entry?.version === "string")?.version ||
      "0.0.0",
    dependencies: Object.keys(packageJson?.dependencies || {}).sort(),
    metadata,
    commandContracts,
    apiContracts,
    toolsProvided: detectTools(metadata.manifests, moduleJson),
    installFootprint
  };
}

async function writeRegistry(workspaceRoot, registry) {
  const targetPath = path.join(workspaceRoot, REGISTRY_PATH);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return targetPath;
}

async function readRegistry(workspaceRoot) {
  const targetPath = path.join(workspaceRoot, REGISTRY_PATH);
  return readJson(targetPath);
}

export async function edsScan(input = {}) {
  const workspaceRoot = path.resolve(input.workspaceRoot || process.cwd());
  const candidates = await discoverCandidates(workspaceRoot);
  const extensions = [];

  for (const candidate of candidates) {
    const scanned = await scanExtension(workspaceRoot, candidate);
    if (scanned.commandContracts.length === 0 && scanned.apiContracts.length === 0 && scanned.toolsProvided.length === 0) {
      continue;
    }
    extensions.push(scanned);
  }

  const registry = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    scanRoots: SCAN_ROOTS,
    extensionCount: extensions.length,
    extensions: extensions.sort((a, b) => a.name.localeCompare(b.name))
  };

  const registryFile = await writeRegistry(workspaceRoot, registry);
  return {
    ok: true,
    registryFile,
    extensionCount: registry.extensionCount,
    registry
  };
}

export async function edsGetRegistry(input = {}) {
  const workspaceRoot = path.resolve(input.workspaceRoot || process.cwd());
  const existing = await readRegistry(workspaceRoot);
  if (existing) {
    return existing;
  }

  const scanned = await edsScan({ workspaceRoot });
  return scanned.registry;
}

export async function edsGetExtension(input = {}) {
  const registry = await edsGetRegistry(input);
  const lookupName = input.name || input.extension || "";
  const normalized = String(lookupName).toLowerCase();

  const found = registry.extensions.find(
    (entry) =>
      String(entry.name).toLowerCase() === normalized ||
      String(entry.path).toLowerCase().includes(normalized)
  );

  if (!found) {
    return {
      found: false,
      name: lookupName,
      extension: null
    };
  }

  return {
    found: true,
    name: lookupName,
    extension: found
  };
}

export async function executeEdsCommand(commandName, input = {}) {
  if (commandName === "eds.scan") {
    return edsScan(input);
  }

  if (commandName === "eds.get.registry") {
    return edsGetRegistry(input);
  }

  if (commandName === "eds.get.extension" || commandName === "eds.get.extension.<name>") {
    return edsGetExtension(input);
  }

  if (commandName.startsWith("eds.get.extension.")) {
    const extensionName = commandName.slice("eds.get.extension.".length);
    return edsGetExtension({ ...input, name: extensionName });
  }

  throw new Error(`Unknown EDS command: ${commandName}`);
}
