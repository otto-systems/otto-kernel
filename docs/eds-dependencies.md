# EDS Dependency Model

## Purpose

EDS reads the generated dependency graph from the meta repo and turns it into a local validation model for the current workspace.

## Inputs

EDS consumes:

- `external/otto/otto-extension-index/dependencies.json`
- `compatibility.json`
- local package metadata in the workspace
- command and API contract definitions from the command service layer

## Validation flow

The runtime validation flow is:

1. scan local extension candidates
2. resolve dependency metadata by extension id
3. compare required and optional extension presence
4. validate contracts, APIs, and tools
5. validate version and compatibility constraints
6. return a registry summary to runtime consumers

## Output

EDS exposes the registry and dependency state through routed commands so runtime code can consume the same truth without hardcoded extension lists.
