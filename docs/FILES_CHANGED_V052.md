# OmniForge v0.5.2 Files Changed

## Desktop lifecycle

- `START_DESKTOP.bat`
  - Rejects stale or version-mismatched native builds and automatically rebuilds them.

- `desktop/main.cjs`
  - Native clipboard IPC.
  - Trusted-origin pointer-lock permission handling.
  - Product version update.
- `desktop/preload.cjs`
  - Context-isolated `copyText` bridge.

## Editor and renderer

- `app/index.html`
  - Focusable viewport canvas.
  - Right-drag fallback guidance.
  - Version update.
- `app/app.js`
  - Clipboard fallback chain.
  - Pointer-lock diagnostics.
  - Right-drag navigation fallback.
  - Surface Recipe selection, preview, validation, commit, revert, and variant workflow.
- `app/renderer.js`
  - Deterministic Surface Recipe layer and mask rendering.
- `app/styles.css`
  - Surface Recipe validation and preview styling.
  - Drag-look state.

## State, API, and AI tools

- `server/state-store.mjs`
  - Surface Recipe schema, normalization, starter records, and migration.
- `server/server.mjs`
  - Surface Recipe update and variant routes.
  - Automatic recipe creation for new materials.
  - Material-to-recipe linkage validation.
- `bridge/mcp-server.mjs`
  - List, update, and variant Surface Recipe tools.

## Tests and package metadata

- `tests/engine.test.mjs`
  - Clipboard, pointer-lock, recipe schema, UI flow, and renderer coverage.
- `package.json`
- `omniforge.project.json`
- `BUILD_DESKTOP_WINDOWS.ps1`
- `README.md`
- `docs/RELEASE_NOTES.md`
- `docs/VERIFICATION_V052.md`
- `docs/FILES_CHANGED_V052.md`
- `data/engine-state.json`
- `data/engine-state.backup.json`
