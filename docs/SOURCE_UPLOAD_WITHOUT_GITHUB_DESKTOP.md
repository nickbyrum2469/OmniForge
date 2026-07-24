# Upload the OmniForge source without GitHub Desktop

The repository contains an automatic source-import workflow. GitHub Desktop is not required.

1. Open the repository in a browser and refresh the page.
2. Select **Add file → Upload files**.
3. Drag `OmniForge-3D-Engine-v0.9.0(2).zip` onto the upload area.
4. Commit the upload directly to `main` with the message `Upload OmniForge v0.9.0 source archive`.
5. Open the **Actions** tab.
6. Wait for **Import OmniForge Source Archive** to finish.

The workflow will:

- Locate the newest `OmniForge-3D-Engine-v*.zip` in the repository root.
- Extract the wrapper directory safely.
- Verify that `package.json`, `app/`, and `desktop/` exist.
- Copy source files into the repository root.
- Exclude `dist/` and `node_modules/`.
- Remove the uploaded ZIP from the repository.
- Commit the extracted source as the authoritative baseline.

After the action completes, the repository root should directly contain `app/`, `desktop/`, `bridge/`, `docs/`, `tests/`, `package.json`, and the launch scripts.
