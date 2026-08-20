# EDS Compatibility Model

## Purpose

EDS validates compatibility constraints from the generated compatibility matrix before a runtime session is considered healthy.

## Compatibility sources

Compatibility is derived from:

- `compatibility.json`
- workspace package versions
- dependency metadata from the meta repo
- core Otto package version constraints

## Validation rules

EDS checks that versions satisfy the compatibility constraints for:

- kernel
- protocol
- command service
- extension support surfaces

## Runtime use

Compatibility failures are surfaced as structured validation data so the runtime or automation can decide whether to continue, warn, or block.
