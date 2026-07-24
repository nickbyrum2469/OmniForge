# OmniForge v0.8.0 Files Changed

## New

- `server/marketplace.mjs` — normalized provider search, details, caching, staged download preparation, archive inspection, model/material import resolution, and provenance helpers.
- `data/catalogs/kenney.json` — curated Kenney CC0 pack records.
- `data/catalogs/quaternius.json` — curated Quaternius CC0 pack records.
- `data/catalogs/quaternius-animations.json` — Quaternius Universal Animation Library metadata.
- `docs/MARKETPLACE.md` — marketplace architecture and limitations.
- `docs/VERIFICATION_V080.md` — test and validation record.
- `docs/FILES_CHANGED_V080.md` — this file.

## Modified

- `server/provider-framework.mjs` — live and curated provider definitions, ambientCG v3 migration, marketplace capabilities, and persistent imported-asset job relationships.
- `server/job-manager.mjs` — provider metadata passed into isolated worker requests.
- `workers/local-worker.mjs` — remote/curated health checks and cancellable marketplace downloads with progress and checksums.
- `server/server.mjs` — marketplace search, details, download, and import routes.
- `server/asset-pipeline.mjs` — explicit top-level source, creator, and license metadata alongside provenance.
- `app/index.html` — Marketplace asset subview.
- `app/app.js` — provider search, details, download, Job Center import, and state integration.
- `app/styles.css` — responsive marketplace layout.
- `bridge/mcp-server.mjs` — four guarded marketplace tools.
- `tests/engine.test.mjs` — marketplace pipeline, ambientCG migration, and v0.8 desktop-version assertions.
- `scripts/verify.mjs` — marketplace syntax and required-package checks.
- `package.json`, desktop launch/build files, project metadata, state defaults, README, release notes, and agent instructions — v0.8.0 identity and operating rules.
