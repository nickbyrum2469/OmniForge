# OmniForge v0.5.1 — Source Areas Added or Changed

The package is not a Git checkout, so this is a release-level source inventory rather than a Git diff.

## Desktop and packaging

- `desktop/main.cjs` — native lifecycle, single instance, app-data isolation, recovery, Safe Mode, process ownership, security, window persistence, native metadata.
- `desktop/preload.cjs` — isolated renderer bridge.
- `resources/omniforge-icon.png`
- `resources/omniforge-icon.ico`
- `START_ENGINE.bat`
- `START_DESKTOP.bat`
- `START_BROWSER_DEV.bat`
- `STOP_ENGINE.bat`
- `BUILD_DESKTOP_WINDOWS.ps1`
- `BUILD_DESKTOP_WINDOWS.bat`

## Project and persistence

- `server/state-store.mjs` — schema 5, atomic state, backups, project catalog, create/open/duplicate/archive/import/locate/migrate, portable roots, layouts, shortcuts, recovery state.
- `server/server.mjs` — Project Hub APIs, session health, project locks, stale-lock handling, thumbnails, error records.
- `data/engine-state.json`
- `data/engine-state.backup.json`
- `data/project-catalog.json`
- `workspace/projects/untitled-game/.omniforge/project-state.json`

## Editor

- `app/index.html` — Project Hub, layout editor, shortcut editor, command palette, tutorial, recovery/error surfaces, resize handles, save-state and selection UI.
- `app/styles.css` — resizable/collapsible workspace, project cards, dialogs, commands, responsive behavior, state indicators.
- `app/app.js` — project lifecycle, layout persistence, shortcuts, command palette, tutorial, breadcrumbs, save-state flow, camera commands, desktop integration.
- `app/renderer.js` — existing viewport/material/path integration preserved.

## Codex

- `bridge/mcp-server.mjs` — project lifecycle tools added to the existing guarded MCP interface.
- `bridge/run-mcp.bat`
- `CONNECT_CODEX.bat`
- `AGENTS.md` — v0.5.1 authority, safety, evidence, and roadmap contract.

## Validation and documentation

- `tests/engine.test.mjs`
- `scripts/verify.mjs`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/RELEASE_NOTES.md`
- `docs/VERIFICATION_V051.md`
- `docs/WINDOWS_SMOKE_TEST.md`
- `docs/OMNIFORGE_V051_IMPLEMENTATION_PLAN.md`
- `docs/ROADMAP_V06_TO_V20.md`
- `docs/AI_GAME_CREATION_ROADMAP.md`
- `docs/CODEX_SETUP.md`
- `docs/MATERIAL_AUTHORING.md`
