# OmniForge v0.9.0 Files Changed

## Core state and server

- `server/state-store.mjs`
  - Surface Recipe schema v2.
  - Compilation cache and performance-cost metadata.
  - Decal Recipe and atlas/trim Recipe schemas.
  - Environment-state defaults.
  - State/project schema migration to 8.
- `server/server.mjs`
  - Processed material derivative route.
  - Surface compilation route.
  - Decal creation and placement routes.
  - Atlas/trim recipe route.
  - v0.9 runtime identity.

## Editor and renderer

- `app/index.html`
  - Production Surface Studio modes and controls.
  - Map Tools, Decal Studio, and Atlas/Trim workspace.
  - v0.9 version label.
- `app/app.js`
  - Shared simple/advanced recipe editing.
  - World/environment settings.
  - PBR derivative processing and seam previews.
  - Decal authoring and placement.
  - Atlas/trim authoring and preview.
  - Compilation cost display.
- `app/renderer.js`
  - Advanced recipe layers and masks.
  - Environment-state uniforms.
  - Recipe layer colors and graph influence.
  - Planar decal rendering and ordering.
- `app/styles.css`
  - Responsive Production Surface Studio layout.
  - Graph, processing, decal, and atlas components.

## Codex

- `bridge/mcp-server.mjs`
  - Expanded Surface Recipe schema.
  - Surface compile tool.
  - Decal creation/placement tools.
  - Atlas/trim creation tool.
  - v0.9 MCP identity.

## Desktop and package identity

- `package.json`
- `desktop/main.cjs`
- `BUILD_DESKTOP_WINDOWS.ps1`
- `START_DESKTOP.bat`
- `omniforge.project.json`
- `AGENTS.md`
- `README.md`
- `server/marketplace.mjs`
- `data/engine-state.json`
- `data/engine-state.backup.json`

These were updated to the v0.9 identity and schema where applicable.

## Tests and verification

- `tests/engine.test.mjs`
  - Surface Recipe v2 tests.
  - Decal and atlas normalization tests.
  - Editor/server/MCP wiring checks.
  - Real API derivative, compile, decal, and atlas workflow.
  - Updated version assertions.
- `scripts/verify.mjs`
  - Current v0.9 documentation and package requirements.
- `docs/SURFACE_STUDIO_V09.md`
- `docs/VERIFICATION_V090.md`
- `docs/FILES_CHANGED_V090.md`
- `docs/RELEASE_NOTES.md`
- `docs/WINDOWS_SMOKE_TEST.md`
