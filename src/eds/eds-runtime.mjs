import fs from "node:fs/promises";
import path from "node:path";

const SCAN_ROOTS = ["external/otto", "modules", "extensions"];
const REGISTRY_PATH = path.join("runtime", "extension-registry.json");
const META_DEPENDENCY_INDEX_PATH = path.join("external", "otto", "otto-extension-index", "dependencies.json");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

const LOCAL_VERSION_PATHS = {
  commandService: path.join("external", "otto", "otto-command-service", "package.json"),
  kernel: path.join("external", "otto", "otto-kernel", "package.json"),
  protocol: path.join("external", "otto", "otto-protocol", "package.json"),
  fileExtension: path.join("external", "otto", "otto-file-extension", "package.json"),
  debugExtension: path.join("external", "otto", "otto-debug-extension", "package.json"),
  apiExtension: path.join("external", "otto", "otto-api-extension", "package.json"),
  cliExtension: path.join("external", "otto", "otto-cli-extension", "package.json"),
  authExtension: path.join("external", "otto", "otto-auth-extension", "package.json")
};

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

function sortUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right)));
}

function normalizeCommandContracts(files, jsonValues) {
  const contracts = [];
  for (let index = 0; index < files.length; index += 1) {
    const parsed = jsonValues[index];
    if (!parsed) {
      continue;
    }

    if (Array.isArray(parsed.commands)) {
      for (const command of parsed.commands) {
        const id = command?.id || command?.name || command?.command;
        if (id) {
          contracts.push({ id, sourceFile: files[index] });
        }
      }
      continue;
    }

    if (typeof parsed.name === "string" || typeof parsed.id === "string") {
      contracts.push({ id: parsed.name || parsed.id, sourceFile: files[index] });
      continue;
    }

    if (Array.isArray(parsed.endpoints)) {
      for (const endpoint of parsed.endpoints) {
        if (endpoint?.command) {
          contracts.push({ id: endpoint.command, sourceFile: files[index] });
        }
      }
    }
  }

  return contracts;
}

function normalizeApiContracts(files, jsonValues) {
  const contracts = [];
  for (let index = 0; index < files.length; index += 1) {
    const parsed = jsonValues[index];
    if (!parsed || !Array.isArray(parsed.endpoints)) {
      continue;
    }

    for (const endpoint of parsed.endpoints) {
      contracts.push({
        method: endpoint.method || "GET",
        route: endpoint.route || endpoint.path || "",
        command: endpoint.command || null,
        sourceFile: files[index]
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

function semverParts(version) {
  return String(version || "0.0.0")
    .replace(/^v/, "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function satisfiesVersion(version, constraint) {
  if (!constraint) {
    return true;
  }

  const normalizedVersion = String(version || "0.0.0").replace(/^v/, "");
  const normalizedConstraint = String(constraint).trim();

  if (normalizedConstraint.startsWith(">=")) {
    return compareVersions(normalizedVersion, normalizedConstraint.slice(2)) >= 0;
  }

  if (normalizedConstraint.startsWith("<=")) {
    return compareVersions(normalizedVersion, normalizedConstraint.slice(2)) <= 0;
  }

  if (normalizedConstraint.startsWith(">")) {
    return compareVersions(normalizedVersion, normalizedConstraint.slice(1)) > 0;
  }

  if (normalizedConstraint.startsWith("<")) {
    return compareVersions(normalizedVersion, normalizedConstraint.slice(1)) < 0;
  }

  if (normalizedConstraint.startsWith("^")) {
    const [major] = semverParts(normalizedConstraint.slice(1));
    const [actualMajor] = semverParts(normalizedVersion);
    return actualMajor === major && compareVersions(normalizedVersion, normalizedConstraint.slice(1)) >= 0;
  }

  if (normalizedConstraint.startsWith("~")) {
    const [major, minor] = semverParts(normalizedConstraint.slice(1));
    const [actualMajor, actualMinor] = semverParts(normalizedVersion);
    return actualMajor === major && actualMinor === minor && compareVersions(normalizedVersion, normalizedConstraint.slice(1)) >= 0;
  }

  return normalizedVersion === normalizedConstraint.replace(/^=/, "");
}

async function loadDependencyIndex(workspaceRoot) {
  const targetPath = path.join(workspaceRoot, META_DEPENDENCY_INDEX_PATH);
  return readJson(targetPath);
}

async function loadLocalVersions(workspaceRoot) {
  const versions = {};

  for (const relativePath of Object.values(LOCAL_VERSION_PATHS)) {
    const packageJson = await readJson(path.join(workspaceRoot, relativePath));
    if (packageJson?.name && packageJson?.version) {
      versions[packageJson.name] = String(packageJson.version);
    }
  }

  return versions;
}

function buildDependencyLookup(dependencyIndex) {
  const lookup = new Map();
  for (const entry of dependencyIndex?.dependencies || []) {
    lookup.set(String(entry.id || entry.name || entry.repository || "").toLowerCase(), entry);
    lookup.set(String(entry.repository || "").toLowerCase(), entry);
    lookup.set(String(entry.name || "").toLowerCase(), entry);
  }

  return lookup;
}

function buildCatalogIndex(dependencyIndex) {
  const catalog = new Map();
  for (const entry of dependencyIndex?.dependencies || []) {
    catalog.set(entry.id, entry);
  }

  return catalog;
}

function detectDependencyCycles(extensions, edgeMap) {
  const extensionNames = new Set(extensions.map((entry) => entry.name));
  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function visit(node, trail) {
    if (stack.has(node)) {
      const startIndex = trail.indexOf(node);
      cycles.push(trail.slice(startIndex).concat(node));
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    stack.add(node);

    for (const next of edgeMap.get(node) || []) {
      if (extensionNames.has(next)) {
        visit(next, [...trail, next]);
      }
    }

    stack.delete(node);
  }

  for (const node of edgeMap.keys()) {
    visit(node, [node]);
  }

  return cycles;
}

function buildDependencySummary(extension, dependencyRecord, versionsByName) {
  const dependencyMetadata = dependencyRecord?.dependencyMetadata || {
    requiredExtensions: [],
    optionalExtensions: [],
    contractDependencies: [],
    apiDependencies: [],
    toolDependencies: [],
    versionConstraints: {},
    installFootprint: []
  };

  const versionStatuses = Object.entries(dependencyMetadata.versionConstraints || {}).map(([name, constraint]) => ({
    name,
    constraint,
    actualVersion: versionsByName[name] || null,
    satisfied: versionsByName[name] ? satisfiesVersion(versionsByName[name], constraint) : false
  }));

  const missingRequiredExtensions = (dependencyMetadata.requiredExtensions || []).filter((name) => !versionsByName[name]);

  return {
    dependencyMetadata,
    dependencyValidation: {
      missingRequiredExtensions,
      versionStatuses,
      satisfied: missingRequiredExtensions.length === 0 && versionStatuses.every((status) => status.satisfied),
      dependencyCount: (dependencyMetadata.requiredExtensions || []).length + (dependencyMetadata.optionalExtensions || []).length
    }
  };
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

async function scanExtension(workspaceRoot, extensionPath, dependencyLookup, versionsByName) {
  const packagePath = path.join(extensionPath, "package.json");
  const modulePath = path.join(extensionPath, "module.json");
  const manifestsDir = path.join(extensionPath, "manifests");
  const contractsDir = path.join(extensionPath, "contracts");
  const commandsDir = path.join(extensionPath, "commands");
  const apisDir = path.join(extensionPath, "apis");
  const toolsDir = path.join(extensionPath, "tools");

  const packageJson = await readJson(packagePath);
  const moduleJson = await readJson(modulePath);

  const manifestFiles = await listJsonFiles(manifestsDir);
  const contractFiles = await listJsonFiles(contractsDir);
  const commandFiles = await listJsonFiles(commandsDir);
  const apiFiles = await listJsonFiles(apisDir);
  const toolFiles = await listJsonFiles(toolsDir);

  const manifestJson = await Promise.all(manifestFiles.map((filePath) => readJson(filePath)));
  const contractJson = await Promise.all(contractFiles.map((filePath) => readJson(filePath)));
  const commandJson = await Promise.all(commandFiles.map((filePath) => readJson(filePath)));
  const apiJson = await Promise.all(apiFiles.map((filePath) => readJson(filePath)));
  const toolJson = await Promise.all(toolFiles.map((filePath) => readJson(filePath)));

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
    ...normalizeApiContracts(commandFiles, commandJson),
    ...normalizeApiContracts(apiFiles, apiJson)
  ];

  const installFootprint = manifestJson.find((entry) => entry && entry.installFootprint)
    ? manifestJson.find((entry) => entry?.installFootprint)?.installFootprint
    : null;

  const extensionId =
    moduleJson?.id ||
    metadata.manifests.find((entry) => typeof entry?.id === "string")?.id ||
    packageJson?.name ||
    path.basename(extensionPath);
  const name =
    moduleJson?.name ||
    metadata.manifests.find((entry) => typeof entry?.name === "string")?.name ||
    packageJson?.name ||
    extensionId;

  const dependencyRecord =
    dependencyLookup.get(String(extensionId).toLowerCase()) ||
    dependencyLookup.get(path.basename(extensionPath).toLowerCase());
  const toolDependencies = detectTools(metadata.manifests, moduleJson);
  const dependencySummary = buildDependencySummary({ name: extensionId }, dependencyRecord, versionsByName);

  return {
    id: extensionId,
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
    toolsProvided: sortUnique([
      ...toolDependencies,
      ...toolJson.flatMap((entry) => (Array.isArray(entry?.tools) ? entry.tools : []))
    ]),
    installFootprint,
    dependencyMetadata: dependencyRecord?.dependencyMetadata || null,
    dependencyValidation: dependencyRecord ? dependencySummary.dependencyValidation : null
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

function buildRegistryValidation(extensions, dependencyLookup, versionsByName) {
  const edgeMap = new Map();
  const missingRequiredExtensions = [];
  const versionConflicts = [];

  for (const extension of extensions) {
    const dependencyRecord = dependencyLookup.get(String(extension.id).toLowerCase()) || dependencyLookup.get(String(extension.path).toLowerCase());
    const dependencyMetadata = dependencyRecord?.dependencyMetadata || null;
    const requiredExtensions = dependencyMetadata?.requiredExtensions || [];

    edgeMap.set(extension.id, requiredExtensions);

    for (const requiredExtension of requiredExtensions) {
      if (!extensions.some((entry) => entry.id === requiredExtension || entry.path.endsWith(`/${requiredExtension}`))) {
        missingRequiredExtensions.push({
          extension: extension.id,
          requiredExtension
        });
      }
    }

    for (const [dependencyName, constraint] of Object.entries(dependencyMetadata?.versionConstraints || {})) {
      const actualVersion = versionsByName[dependencyName];
      if (actualVersion && !satisfiesVersion(actualVersion, constraint)) {
        versionConflicts.push({
          extension: extension.id,
          dependency: dependencyName,
          constraint,
          actualVersion
        });
      }
    }
  }

  const cycles = detectDependencyCycles(extensions, edgeMap);

  return {
    missingRequiredExtensions,
    versionConflicts,
    cycles,
    satisfied:
      missingRequiredExtensions.length === 0 &&
      versionConflicts.length === 0 &&
      cycles.length === 0
  };
}

async function loadDependencyState(workspaceRoot) {
  const [dependencyIndex, versionsByName] = await Promise.all([
    loadDependencyIndex(workspaceRoot),
    loadLocalVersions(workspaceRoot)
  ]);

  return {
    dependencyIndex,
    dependencyLookup: buildDependencyLookup(dependencyIndex),
    versionsByName
  };
}

export async function edsScan(input = {}) {
  const workspaceRoot = path.resolve(input.workspaceRoot || process.cwd());
  const candidates = await discoverCandidates(workspaceRoot);
  const dependencyState = await loadDependencyState(workspaceRoot);
  const extensions = [];

  for (const candidate of candidates) {
    const scanned = await scanExtension(workspaceRoot, candidate, dependencyState.dependencyLookup, dependencyState.versionsByName);
    if (scanned.commandContracts.length === 0 && scanned.apiContracts.length === 0 && scanned.toolsProvided.length === 0) {
      continue;
    }
    extensions.push(scanned);
  }

  const validation = buildRegistryValidation(extensions, dependencyState.dependencyLookup, dependencyState.versionsByName);
  const registry = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    scanRoots: SCAN_ROOTS,
    dependencyIndexPath: path.join(workspaceRoot, META_DEPENDENCY_INDEX_PATH).replace(/\\/g, "/"),
    dependencyIndexGeneratedAt: dependencyState.dependencyIndex?.generatedAt || null,
    dependencyValidation: validation,
    extensionCount: extensions.length,
    extensions: extensions.sort((left, right) => left.name.localeCompare(right.name))
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
  if (existing && existing.dependencyIndexPath) {
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
      String(entry.id || "").toLowerCase() === normalized ||
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
