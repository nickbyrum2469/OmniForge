# OmniForge v0.5.1 Verification Record

## Authoritative source

The authoritative artifact for this validation is the local package directory:

```text
/mnt/data/OmniForge-3D-Engine-v0.5.1
```

This directory is not a Git checkout. No branch or commit metadata exists, so no branch, commit, merge, or publication claim is made.

## Commands executed

```text
node --check server/state-store.mjs
node --check server/server.mjs
node --check bridge/mcp-server.mjs
node --check app/app.js
node --check app/renderer.js
node --check desktop/main.cjs
node --test tests/*.test.mjs
npm run verify
```

Additional integration probes launched:

- One isolated runtime for Project Hub API testing.
- Two simultaneous runtimes against one isolated data root to test project write locking.
- One MCP initialize/tools-list exchange.
- One Chromium attempt against the live editor origin.

## Automated result

```text
20 tests passed
0 failed
```

Covered behavior:

1. General-purpose starter project and 3D scene.
2. Layout, shortcut, recovery, and camera defaults.
3. Scene-object creation.
4. Deterministic terrain.
5. Terrain-conforming path contracts.
6. Soft path shoulders.
7. PBR material files.
8. Correct horizontal mouse-look sign.
9. Desktop lifecycle source contracts.
10. Pinned Windows builder and executable metadata stamping.
11. Project Hub and editor usability wiring.
12. Project create/open/duplicate/archive/import/migrate/locate lifecycle.
13. Live concurrent-writer rejection.
14. Starter-object grounding.
15. Browser automation bridge.
16. Managed workspace containment.
17. MCP initialization and project/scene/material/prefab tools.
18. Material-setting clamping.
19. Live material tiling and PBR control wiring.
20. Legacy-product-name scan.

## Runtime project lifecycle evidence

An isolated data root successfully:

- Created a starter project.
- Opened it.
- Duplicated it under a new stable ID.
- Imported a copied project folder.
- Migrated state to schema 5.
- Renamed/moved a managed project externally.
- Detected it as missing.
- Located and restored it.
- Archived a project into the managed archive.

## Lock evidence

A first server opened the active project and wrote its project lock. A second server with a different session token attempted to use the same data root. The second process exited with the expected “already open in another OmniForge session” error. The first process then shut down and released its lock.

## Desktop-source evidence

Static and syntax validation confirmed source paths for:

- Single-instance lock.
- Dedicated user-data path.
- Crash reporting to local storage without upload.
- Unclean-session marker.
- Recovery prompt.
- Safe Mode.
- Runtime health marker.
- Stale process-tree cleanup.
- Context isolation.
- Sandbox.
- Restricted navigation.
- Denied permissions.
- Preload bridge.
- OmniForge icon and About metadata.
- Windows rcedit executable stamping with a pinned checksum.

## Visual inspection result

A fresh visual inspection could not be completed in the current environment. The managed Chromium policy replaced every local application origin—including loopback, container IP, and a custom host mapping—with an organization-blocked page before OmniForge loaded.

The blocked page was not saved or presented as application evidence.

Therefore:

- Source syntax passed.
- API and project lifecycle passed.
- WebGL/editor UI did not receive a fresh v0.5.1 rendered inspection here.
- The actual Windows desktop executable was not launched in this Linux environment.

## Required target-Windows test

Before calling the Windows desktop release validated:

1. Run `START_ENGINE.bat`.
2. Confirm the pinned runtime downloads and `OmniForge.exe` is assembled.
3. Inspect executable icon and Properties → Details metadata.
4. Confirm no browser tab opens.
5. Confirm no visible Node terminal remains.
6. Verify Project Hub workflows.
7. Resize, collapse, save, and restore layouts.
8. Remap a shortcut and restart.
9. Test pointer capture, WASD, Space, Ctrl, Shift, and Escape.
10. Test normal close and child cleanup in Task Manager.
11. Force-close the app and test recovery and Safe Mode.
12. Capture editor, Project Hub, layout, command palette, shortcuts, recovery, and Safe Mode screenshots.

## Known limitations

- The Windows executable itself is not included prebuilt; the first Windows start assembles it from the pinned Electron runtime.
- Code signing is not configured.
- Advanced v0.6–v0.20 systems remain plans.
- Current physics is foundational rather than production-grade.
- Current renderer remains a custom WebGL vertical slice.
