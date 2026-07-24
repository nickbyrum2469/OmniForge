# Connect Codex to OmniForge v0.5.1

## Automatic Windows setup

Double-click `CONNECT_CODEX.bat` from the extracted source package. The script removes old OmniForge registrations and registers the current MCP bridge as:

```text
omniforge
```

The bridge launches through `bridge\run-mcp.bat`, which points it at `%APPDATA%\OmniForge`. The desktop editor and Codex therefore share the same project catalog and authoritative state.

Restart Codex after registration and open the OmniForge source folder.

## Required operating sequence

1. Read `AGENTS.md`.
2. Call `omniforge_get_state`.
3. Call `omniforge_list_projects` when project context matters.
4. Read queued commands.
5. Search existing scene objects, materials, assets, and prefabs before creating content.
6. Use stable IDs.
7. Use grouped transactional edits for coherent changes.
8. Ground objects through terrain queries rather than guessed Y coordinates.
9. Request viewport captures after visual changes.
10. Report requested, changed, tested, failed, blocked, and remaining work accurately.

## Project lifecycle tools

Codex may list, open, create, duplicate, and archive managed projects. These operations use the same project state and lock model as the editor.

## Safety boundaries

- MCP file access is limited to managed workspace paths.
- Protected materials cannot be silently deleted.
- Visual work is not considered tested until the real editor captures it.
- Project write locks prevent simultaneous active writers.
- Planned provider secrets must use future secure storage; no secret should be written into source or project files.
