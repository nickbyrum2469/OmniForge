# OmniForge v0.5.1 Acceptance Criteria

## Desktop lifecycle

- Starting `START_ENGINE.bat` launches the desktop workflow rather than the browser-development launcher.
- Normal startup does not open a browser tab.
- Normal startup does not leave a visible Node terminal.
- A second OmniForge launch focuses the existing window.
- Application data uses the dedicated OmniForge user-data directory.
- Closing OmniForge terminates its runtime child process.
- A stale runtime is detected and removed on next startup.
- An unclean prior session presents recovery options.
- Safe Mode disables play and automatic capture.
- Window geometry persists.
- App icon, name, About metadata, and Windows executable version resources are configured.
- Browser development remains available through a separate launcher.

## Project Hub

- Create a blank project.
- Create a starter 3D project.
- Open a recent project.
- Recent ordering updates.
- Capture and display a thumbnail.
- Duplicate without copied cache/build folders.
- Archive without permanent deletion.
- Import an existing folder.
- Migrate older state to schema 5.
- Detect a moved or missing directory.
- Locate and restore a moved project.
- Block a second live writer from the active project.
- Remove a stale project lock safely.

## Editor usability

- Resize all three panel boundaries.
- Collapse and restore each panel.
- Apply built-in layouts.
- Save and restore a custom layout.
- Search and execute commands.
- Remap keyboard shortcuts.
- Reject shortcut conflicts.
- Clear selection by clicking empty viewport space.
- Display hierarchy breadcrumbs for nested entities.
- Show dirty/saving/saved/error state accurately.
- Present actionable errors without losing the underlying details.
- Complete or skip the first-use tutorial.
- Reset camera.
- Focus selected entity.
- Configure horizontal inversion independently from vertical inversion.
- Persist sensitivity, movement speed, and FOV.

## Existing renderer/material regression

- Starter scene loads.
- Terrain renders.
- Terrain path conforms to terrain.
- Path uses a soft blend shoulder.
- Starter entities remain grounded.
- Rightward mouse motion increases yaw under default settings.
- Material tiling, rotation, offsets, roughness, metallic, normal, AO, and height settings persist.
- Material variants remain independent.
- Existing prefab and MCP operations remain available.

## Persistence and recovery

- State writes are atomic.
- Backup state remains readable after primary corruption.
- Project state survives application restart.
- Layouts and shortcuts survive restart.
- Project catalog survives restart.
- Missing directory does not silently delete the project record.

## Evidence required before final Windows release claim

- Launch actual `OmniForge.exe` on Windows.
- Verify no browser or visible terminal.
- Verify Task Manager process cleanup on normal close.
- Force an unclean close and inspect recovery flow.
- Open Safe Mode.
- Exercise Project Hub operations.
- Resize/collapse/save layout.
- Exercise command palette and shortcuts.
- Navigate the real viewport.
- Capture screenshots of editor, Project Hub, layout dialog, and recovery/safe-mode states.
- Restart and confirm persistence.

## Current validation boundary

The source-level and local runtime tests pass in the Linux environment. The packaged Windows executable has not been launched here, and managed Chromium blocks local application origins, so direct Windows and latest rendered UI evidence remain required on the target machine.
