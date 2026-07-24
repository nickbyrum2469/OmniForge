# OmniForge Authoritative Development Contract

## Repository authority

- This repository is the authoritative OmniForge source.
- Before changing code, record the repository, branch, commit, runnable entry point, project schema, state schema, renderer, importer, asset manifest, recipe system, persistence path, and test commands.
- Never substitute a stale ZIP, duplicate editor, mock scene, diagnostic-only implementation, or separate prototype.
- Preserve approved systems and repair root causes in the authoritative source.

## Import pipeline rules

- Preserve original imported files.
- Stage untrusted input before canonical import.
- Validate GLB/glTF structure, scene graphs, node indices, cycles, accessor ranges, buffer views, transforms, materials, textures, skins, and animations.
- Never recurse through an unvalidated cyclic node graph.
- Use iterative traversal or explicit cycle detection and depth limits.
- Apply complete world transforms to each mesh instance.
- Apply inverse-transpose normal transforms and correct mirrored winding.
- Do not silently discard unsupported data; retain source data and report limitations.
- Failed imports remain visible in a failed/unvalidated area with actionable diagnostics.

## Asset deletion rules

- Deletion is a guarded transaction, not direct filesystem removal.
- Inspect scene usages, recipe links, material dependencies, derivatives, thumbnails, collision, LODs, previews, staged files, provider jobs, and audit records before deletion.
- Default action is archive or move to project trash.
- Block deletion of an asset still referenced by scenes unless usages are removed or replaced explicitly.
- Support undo/restore where practical.
- Never delete files outside the managed project directories.
- Reconcile the asset graph after deletion and report orphaned references.

## Testing standard

- Compilation alone is not completion.
- Run the actual current editor.
- Exercise the full workflow.
- Inspect rendered results from relevant views.
- Test save/reload and application restart.
- Test malformed inputs and failure handling.
- Retest surrounding approved systems.
- Report what passed, failed, remained blocked, and was not tested.

## AI behavior

- AI tools use typed, guarded application APIs.
- AI actions produce preview, validation, audit records, affected IDs, and undo information.
- Destructive actions require explicit approval.
- The AI must not claim an operation was applied when it only proposed or previewed it.
