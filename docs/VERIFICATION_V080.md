# OmniForge v0.8.0 Verification Record

## Scope

This record covers the Free Asset Marketplace implementation layered onto the authoritative v0.7.1 Provider Framework, Job Center, canonical asset pipeline, desktop editor, and Codex bridge.

## Implemented

- Marketplace subview inside the existing Assets workspace.
- Provider, type, and keyword filtering.
- Result cards, thumbnails, provider identity, license, creator, source page, and availability state.
- Detailed format/resolution choices.
- Poly Haven live API adapter.
- ambientCG API v3 adapter and v2-to-v3 settings migration.
- Curated Kenney catalog.
- Curated Quaternius catalog.
- Curated Quaternius Universal Animation Library record.
- Persistent marketplace download jobs.
- Isolated worker downloads.
- Redirect handling, progress, cancellation, logs, SHA-256 output checksums, and provider MD5/SHA-256 verification when supplied.
- Safe archive extraction.
- Canonical GLB/glTF import from completed jobs.
- PBR material import from recognized downloaded maps.
- Provenance, source, license, provider ID, provider asset ID, and download relationship persistence.
- Job-to-imported-asset relationship persistence.
- Four guarded Codex marketplace tools.

## Commands run

```text
node --check server/server.mjs
node --check server/provider-framework.mjs
node --check server/job-manager.mjs
node --check server/marketplace.mjs
node --check workers/local-worker.mjs
node --check bridge/mcp-server.mjs
node --check app/app.js
node --check app/renderer.js
node --check desktop/main.cjs
npm test
npm run verify
```

## Automated results

- 38 tests passed.
- 0 tests failed.
- Existing desktop lifecycle, Project Hub, viewport input, Surface Recipe, material, terrain/path, canonical asset, import-rebuild, provider, worker, job, and MCP tests remained passing.
- A mocked Poly Haven API completed search, details, format selection, a real isolated staged download job, checksum output, canonical GLB import, asset persistence, provenance persistence, and job/import relationship persistence.
- Existing ambientCG v2 settings migrate to the current v3 asset API.
- The package structure and source syntax checks passed.

## Directly exercised workflow

The end-to-end provider test used an actual GLB file through a mocked provider boundary:

1. Provider catalog search returned a CC0 model.
2. Asset details returned a downloadable GLB choice.
3. The Job Center queued and completed a marketplace download in an isolated worker.
4. The staged file existed and had a calculated SHA-256 checksum.
5. The import endpoint passed it through the canonical asset pipeline.
6. The asset was recorded with source URL, creator, license, canonical derivative, and stable ID.
7. The completed job retained the imported asset ID.

This proves the internal provider-to-project pipeline without misrepresenting external network availability.

## Not fully validated in this environment

- Live Poly Haven search/download against the public service.
- Live ambientCG v3 search/download against the public service.
- Actual Windows Electron rendering of the new Marketplace subview.
- Download cancellation during a large real internet transfer.
- Visual inspection of a real provider model or material after import.
- Native Windows archive extraction path.

These require the target Windows machine and its network connection. The editor includes provider-specific health checks so failures should be visible rather than hidden.

## Required Windows inspection

1. Launch the current desktop build.
2. Open Assets → Marketplace.
3. Run provider health checks in Integrations.
4. Search Poly Haven for a small model.
5. Inspect its license and source page.
6. Select the smallest GLB option.
7. Download it and inspect progress/logs in Job Center.
8. Import it, preview it in the real scene, and inspect front/side/rear/top/player views.
9. Save and restart OmniForge.
10. Confirm asset provenance and scene usage persist.
11. Search ambientCG for a 1K material.
12. Download and import it.
13. Verify recognized PBR maps, tiling controls, Surface Recipe, save/reload, and terrain/path use.
14. Confirm a disabled or unavailable provider does not block startup or local work.

## Remaining limitations

See `docs/MARKETPLACE.md`. No claim is made that curated sources are automatically downloaded, that HDRIs already render, or that every external archive convention is supported.
