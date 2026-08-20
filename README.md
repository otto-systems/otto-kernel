# Otto Kernel

The Otto Kernel is the core process responsible for discovering, loading, and
managing Otto modules and services.

## Responsibilities

- Discover and register modules via manifests
- Integrate with the Command Service Layer
- Integrate with OttoUpdate
- Provide lifecycle management for modules
- Provide the Extension Discovery Service (EDS) for local workspace extension
  indexing

## Planned Structure

- `src/` – Rust kernel logic
- `docs/` – architecture and manifest documentation
- `prompts/` – Copilot prompt packs (added later)

## Extension Discovery Service (EDS)

- Scans local workspace roots only: `external/otto`, `modules`, and
  `extensions`.
- Reads `module.json`, `manifests/*.json`, `contracts/*.json`,
  `commands/*.json`, and `package.json`.
- Writes unified local registry to `runtime/extension-registry.json`.
- Exposes internal routed commands: `eds.scan`, `eds.get.registry`, and
  `eds.get.extension`.
