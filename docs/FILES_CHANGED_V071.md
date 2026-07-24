# OmniForge v0.7.1 Files Changed

## Core runtime

- `server/provider-framework.mjs` — normalized provider records, statuses, integration settings, job records, and hardware summaries.
- `server/job-manager.mjs` — persistent queue, scheduling, worker lifecycle, cancellation, retry, recovery, and result handling.
- `workers/local-worker.mjs` — isolated provider health, asset-index, project-integrity, and diagnostic operations.
- `server/server.mjs` — provider/job routes and canonical asset rebuild route.
- `server/state-store.mjs` — provider, job, editor-layout, and version migrations.

## Asset pipeline and renderer

- `server/asset-pipeline.mjs` — hierarchy-aware glTF scene traversal, nested transform flattening, normal transforms, mirrored winding repair, material groups, canonical revisions, and source-preserving rebuild history.
- `app/renderer.js` — imported material-group rendering and revision-aware GPU mesh cache invalidation.
- `app/app.js` — focused asset subviews, layout fitting, import health information, rebuild workflow, providers, and Job Center behavior.
- `app/index.html` — Models, Surfaces, Prefabs, Integrations, Jobs, and setup interfaces.
- `app/styles.css` — responsive panel cleanup, subviews, job/provider layouts, and rebuild callout.

## AI interface

- `bridge/mcp-server.mjs` — provider/job tools and guarded `omniforge_rebuild_asset_import`.

## Desktop/package

- `package.json`, `desktop/main.cjs`, `BUILD_DESKTOP_WINDOWS.ps1`, `START_DESKTOP.bat`, `AGENTS.md`, `README.md`, and `omniforge.project.json` — version 0.7.1 and updated operating rules.

## Tests and documentation

- `tests/engine.test.mjs` — provider jobs, responsive workspace, hierarchy transforms, material groups, rebuild history, API integration, and MCP rebuild coverage.
- `docs/PROVIDER_SDK.md`
- `docs/JOB_SYSTEM.md`
- `docs/WORKER_PROTOCOL.md`
- `docs/VERIFICATION_V071.md`
- `docs/FILES_CHANGED_V071.md`
- `docs/ASSET_PIPELINE.md`
- `docs/WINDOWS_SMOKE_TEST.md`
- `docs/RELEASE_NOTES.md`
