# OmniForge v0.8.0 Marketplace Architecture

## Purpose

The Marketplace is part of the authoritative OmniForge asset pipeline. Online and curated catalog entries are normalized into provider-independent records, downloaded through persistent background jobs, staged outside the approved asset library, validated, and then imported through the same canonical model or material pipeline used for local files.

It is not a web-page wrapper and does not let remote providers write directly into project assets.

## Providers

### Poly Haven

- Live search and metadata through the public Poly Haven API.
- Live file-choice discovery through the provider file endpoint.
- Models, PBR materials, and HDRIs are represented as CC0 catalog records.
- Requests identify OmniForge with a unique User-Agent.
- The interface labels Poly Haven as the source of live catalog content.

### ambientCG

- Uses the current ambientCG API v3 `/assets` endpoint.
- Supports filtering for materials, HDRIs, and 3D models.
- Search responses request downloads, previews, thumbnails, descriptions, dimensions, and tags.
- Existing projects carrying the retired v2 endpoint are migrated to v3 when loaded.

### Kenney

- A curated local catalog exposes supported CC0 packs.
- Source pages and license information are available before installation.
- Automated scraping or silent mass download is intentionally not implemented.

### Quaternius

- A curated local catalog separates static/rigged asset packs from animation-library metadata.
- Source pages and CC0 license records are retained.
- The Universal Animation Library is cataloged for the future animation and retargeting milestones; v0.8 does not claim animation runtime support.

## Normalized marketplace record

```js
{
  id,
  providerId,
  name,
  description,
  kind,              // model | material | hdri | animation
  category,
  tags,
  license,
  creator,
  thumbnail,
  sourcePage,
  automatedDownload,
  downloadChoices,
  metadata
}
```

The user can search and inspect a record without importing it. Download choices are resolved only when details are requested.

## Download transaction

```text
Catalog result
    ↓
Inspect source and license
    ↓
Choose format and resolution
    ↓
Create persistent marketplace-download job
    ↓
Isolated worker downloads into staging
    ↓
Checksum verification
    ↓
Job output remains inspectable
    ↓
Explicit import command
    ↓
Canonical model or material pipeline
    ↓
Draft asset + provenance + validation
```

Downloads are stored under the application runtime's marketplace staging area. A successful HTTP response does not create an approved project asset.

## Model import

A staged GLB or embedded glTF is passed into the hierarchy-aware canonical importer. The original file is preserved, node transforms and material groups are processed, an Asset Health Report and Asset Recipe are created, and the resulting asset remains Draft until inspected.

Marketplace provenance adds:

- provider ID
- provider asset ID
- source page
- creator
- license
- original download checksums
- download job relationship
- imported asset relationship

## Material import

Downloaded archives are extracted into an isolated staging folder. Recognized PBR maps are classified and copied into a new material asset without modifying the downloaded source. A linked Surface Recipe is created in Draft state.

Currently recognized map families include base color, normal, roughness, metallic, ambient occlusion, height/displacement, emissive, and opacity.

## Job Center integration

Marketplace downloads expose:

- provider
- selected asset and resolution
- progress
- stage
- elapsed time
- logs
- warnings and errors
- downloaded files
- SHA-256 checksums
- cancellation state
- retry eligibility
- imported asset ID after import

The imported asset relationship persists because it is part of the normalized job schema.

## Offline behavior

- Curated catalogs remain searchable offline.
- Live-provider metadata can use a valid local cache.
- If Offline Mode is enabled and no cache exists, the editor reports the provider as unavailable rather than fabricating results.
- Downloaded and imported project assets remain usable independently of the provider.

## Codex tools

The MCP bridge exposes guarded tools for:

- marketplace search
- marketplace record inspection
- staged download jobs
- import from a completed job

Codex cannot bypass staging, validation, provenance recording, or the canonical import pipeline.

## Current limitations

- Live-provider behavior requires target-network testing because the build environment cannot reach provider APIs directly.
- Curated Kenney and Quaternius entries open their official source pages for manual selective download; automatic package installation is intentionally deferred.
- HDRI runtime import is not implemented in this release. HDRI downloads remain staged for later environment-system support.
- External-buffer glTF packages still require a future dependency-aware import pass; GLB remains the preferred model format.
- Complex provider archives may contain naming conventions not yet recognized by the PBR-map classifier and will remain staged with a clear import failure.
