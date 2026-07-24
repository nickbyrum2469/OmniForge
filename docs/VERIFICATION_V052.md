# OmniForge v0.5.2 Verification Record

## Requested repairs

- Make **Copy details** place the full error report on the Windows clipboard.
- Restore viewport navigation when the desktop shell blocks pointer lock.
- Continue the v0.5.1 roadmap with the first authoritative recipe-system implementation.

## Implemented

### Clipboard

- Added a context-isolated desktop IPC command backed by Electron's native `clipboard` service.
- Added browser fallback through `navigator.clipboard.writeText`.
- Added a final hidden-textarea `execCommand('copy')` fallback for development browsers.
- Added visible success feedback and meaningful failure reporting.
- Added launcher version checks so extracting a new source release over an older folder cannot silently reopen an older `dist` executable.

### Viewport navigation

- Replaced the desktop session's blanket permission denial with an origin-restricted `pointerLock` permission policy.
- The permission is granted only to the active loopback editor origin.
- The viewport canvas is keyboard-focusable before capture.
- Added pointer-lock success and error feedback.
- Added right-mouse-drag look plus WASD fallback when pointer lock is unavailable.
- Kept separate horizontal and vertical inversion, sensitivity, speed, FOV, Space ascend, Ctrl descend, and Shift boost.

### Surface Recipe foundation

- Added stable `surfaceRecipe` assets linked to authoritative material IDs.
- Added migration for existing material assets.
- Added dirt, moss, wetness, snow, damage, color variation, and detail layers.
- Added upward-facing, slope, cavity, and ground-contact masks.
- Added validation reports and non-destructive variants.
- Added live editor previews with explicit **Commit preview** and **Revert** operations.
- Added renderer integration for terrain and path materials.
- Added guarded Codex list, update, and variant tools.

## Automated validation

`npm run verify` completed successfully:

- Server syntax: passed
- MCP syntax: passed
- Editor syntax: passed
- Renderer syntax: passed
- Desktop syntax: passed
- Automated tests: **23 passed, 0 failed**
- Package structure: passed

## Live API validation

A real isolated runtime was started on a temporary port and tested:

- Runtime reported version `0.5.2`.
- Two starter Surface Recipes migrated and linked to their materials.
- Recipe layer and mask update persisted and returned a valid validation report.
- A recipe variant was created, retained its source relationship, and was assigned to its base material.

## MCP validation

A real MCP process completed:

- Initialize handshake.
- Tool listing with 31 tools.
- Surface Recipe listing.
- Surface Recipe update through the guarded tool.

## Environment limitations

- The managed Chromium installation blocks every local application origin through organization policy. It displayed a policy block page before OmniForge loaded, so it could not be used as rendered evidence.
- The Windows Electron executable cannot be launched inside this Linux environment.
- Therefore native clipboard behavior and pointer-lock behavior still require the included direct Windows smoke test. Source policy, IPC wiring, API behavior, migrations, and fallback navigation passed the available checks.
