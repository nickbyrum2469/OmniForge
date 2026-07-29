# Target-PC Pathway Repair

## Authority

- Repository: `C:\Users\nickb\Documents\OmniForge-Git`
- Branch: `phase1c/crash-celestial-atmosphere-stabilization`
- Baseline commit: `20805d70ef556b26d0a08eed75896f6d8aaf58ca`
- Saved-project copy: `C:\Users\nickb\Documents\OmniForge-TargetPC-Pathway-Test\20260728-181917\OmniForge`
- Baseline state SHA-256: `4B29646275B0F3B775FF57637EF2E07FCB806BF03FC826BD790EAA5A61C9D374`

## Reproduced failure

The exact packaged build and saved project produced a suspended road slab, large vertical corridor bands, a folded-looking underside, and a second older path presentation painted into the terrain.

The saved branch path requested a 14 percent maximum grade, 5 m maximum cut, and 3 m maximum fill. The previous compiler reported that route as valid while producing approximately 14 m of fill in the compiled profile. Its cross section then connected that invalid profile to the original terrain with fixed-width side bands.

## Root causes

1. Grade enforcement ran after local cut/fill clamping. The final grade pass could move a station outside its allowed cut/fill interval.
2. Path validation checked compiled grade but did not require a jointly feasible grade/cut/fill solution.
3. Server diagnostics accumulated cut and fill across every station and presented the sum like a maximum.
4. The terrain material pass painted every visible path while Pathway Studio rendered a second dedicated corridor.
5. Corridor terrain seams used a fixed side-slope width rather than finding a terrain intersection.
6. Editor guides sampled a separate terrain-following route instead of the final corridor profile.
7. No geometry gate prevented an unsafe corridor mesh from reaching WebGL.

## Hypothesis results

- Confirmed: duplicate legacy terrain material authority.
- Confirmed: fixed-width side bands amplified an invalid vertical profile into walls.
- Confirmed: invalid routes could be marked gameplay-ready.
- Confirmed: guide and production surface used different height authorities.
- Rejected for this saved failure: recursive main/branch height sampling. The corridor profile samples `terrainBaseHeightAt`, not another path-modified height.
- Rejected for this saved failure: world scaling changed path coordinates. The saved path coordinates and terrain bounds were already stable world-space data.

## Repair contract

- Pathway Studio corridor is the default visible surface authority.
- Terrain painting and terrain-height deformation require an explicit `legacy-terrain` compatibility authority.
- Grade, cut, and fill are solved together. An infeasible solution remains inside local cut/fill bounds and is blocked from gameplay approval.
- Side slopes search for terrain intersection with configurable cut and fill ratios.
- Spline guides derive from the exact generated corridor center and road-edge rows.
- Non-finite, out-of-range, degenerate, flipped, or excessive vertical-edge geometry is blocked before WebGL upload.
- Server and editor diagnostics expose authority, feasibility, gameplay readiness, and geometry status.

## Current gate

Automated source coverage includes the exact saved terrain and branch parameters. The branch remains blocked until the exact packaged Windows application is run against the copied saved project and passes multi-angle visual, interaction, save/reload, and WebGL checks.
