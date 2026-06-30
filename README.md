# Otto Kernel

The Otto Kernel is the core process responsible for discovering, loading, and managing Otto modules and services.

## Responsibilities
- Discover and register modules via manifests
- Integrate with the Command Service Layer
- Integrate with OttoUpdate
- Provide lifecycle management for modules

## Planned Structure
- `src/` – Rust kernel logic
- `docs/` – architecture and manifest documentation
- `prompts/` – Copilot prompt packs (added later)
