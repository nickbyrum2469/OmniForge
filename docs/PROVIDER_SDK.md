# OmniForge v0.7.1 Provider SDK

## Purpose

The provider layer gives OmniForge one normalized boundary for local project services, future online asset catalogs, remote generation services, and isolated local AI workers. Provider-specific implementation details must not leak into scene, asset, or editor code.

## Provider record

Every provider declares:

- Stable provider ID
- Display name and description
- Provider kind
- Capabilities
- Supported job operations
- Enabled and required state
- Normalized settings
- Runtime status
- Version
- Actual execution backend
- Last health check
- Hardware report when available

Supported status states are `connected`, `disconnected`, `unavailable`, `installing`, `updating`, `degraded`, and `failed`.

## Initial providers

### Project Asset Library

Searches and validates assets already owned by the active project. This provider is required and cannot be disabled.

### Local Surface Generator

Represents the deterministic offline surface-generation capability already present in OmniForge. It can be disabled independently.

### Isolated Worker Host

Runs long operations outside the editor process. It is required by the current health, asset-index, project-integrity, and diagnostic jobs.

## Rules

- A failed optional provider must not prevent editor startup.
- Required providers cannot be disabled.
- Providers expose only declared capabilities and operations.
- Provider updates are normalized and persisted.
- Health checks run as jobs rather than blocking the editor.
- Hardware reports reflect the machine and backend that actually completed the health check.
- No provider may write arbitrary project files.
- API keys are not implemented in v0.7.1. Future secret-bearing providers must use native credential storage and must never write secrets to project state or logs.

## Extension contract

Future providers such as Poly Haven, ambientCG, Kenney, Quaternius, TripoSR, UniRig, or Meshy should be registered through this layer and use the shared Job Center. They must not create parallel download queues or background-process managers.
