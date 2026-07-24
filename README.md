# OmniForge

OmniForge is a general-purpose, AI-native 3D game engine and editor.

## Authoritative source policy

This GitHub repository is the authoritative source for OmniForge development. Do not replace it with a disconnected prototype, alternate editor, stale ZIP, duplicate scene system, or diagnostic-only build.

Current source baseline to import: **OmniForge v0.9.0**.

## Import the source without GitHub's browser upload limit

GitHub's web uploader rejects the complete packaged ZIP. Use the repository importer instead. It accepts either an already-extracted OmniForge source directory or a ZIP, finds the real project root, excludes `dist`, Electron binaries, `node_modules`, caches, logs, archives, and generated runtime files, then pushes the individual source files through Git.

### Preferred: extracted-folder method

Open Windows PowerShell and run:

```powershell
$script = "$env:TEMP\Import-OmniForgeSource.ps1"
Invoke-WebRequest "https://raw.githubusercontent.com/nickbyrum2469/OmniForge/main/tools/Import-OmniForgeSource.ps1" -OutFile $script
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -SourcePath "C:\Users\nickb\Downloads\Compressed\OmniForge-3D-Engine-v0.9.0"
```

This method bypasses ZIP extraction entirely.

### ZIP method

The helper also accepts a ZIP and uses a duplicate-entry-safe extractor:

```powershell
$script = "$env:TEMP\Import-OmniForgeSource.ps1"
Invoke-WebRequest "https://raw.githubusercontent.com/nickbyrum2469/OmniForge/main/tools/Import-OmniForgeSource.ps1" -OutFile $script
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -SourcePath "C:\Users\nickb\Downloads\Compressed\OmniForge-3D-Engine-v0.9.0.zip"
```

The helper installs Git and GitHub CLI through `winget` when needed, verifies authentication through a real GitHub API request, clones this repository, copies only authoritative source files, records a source fingerprint, commits, and pushes to `main`.

The source must end up directly in the repository root:

```text
OmniForge/
├── app/
├── desktop/
├── bridge/
├── assets/
├── docs/
├── tests/
├── package.json
└── START_ENGINE.bat
```

Do not retain an extra `OmniForge-3D-Engine-v0.9.0/` wrapper and do not commit `dist`, `node_modules`, downloaded Electron runtimes, caches, or the ZIP itself.

After the source is present, development uses milestone branches and pull requests. The active major-pass branch is:

`milestone-10/foliage-lighting-foundation`

## Immediate repair and expansion scope

- Repair packaged marketplace worker resolution so downloads work without MCP.
- Correct remaining GLB/glTF import defects and stack-overflow failures.
- Add archive, restore, and dependency-aware deletion for imported assets.
- Implement category-aware terrain-contact placement for props, trees, vehicles, rocks, and buildings.
- Clean the Assets, Marketplace, Jobs, and inspector workflows.
- Add authoritative foliage species, families, biomes, deterministic placement, exclusions, wind, seasons, streaming, and low-end budgets.
- Add optimized hybrid lighting, a dedicated atmosphere system, time, celestial bodies, stars, clouds, and weather.
- Preserve every approved v0.5-v0.9 system.

See issue #2 for the full acceptance plan. Water remains the dedicated milestone immediately after this pass.

## Development standard

A feature is not complete because it compiles or displays a panel. Test the real workflow in the authoritative application, inspect the rendered result, test persistence and restart, verify failure handling, and retest surrounding approved systems.
