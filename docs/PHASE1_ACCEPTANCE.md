# Phase 1 acceptance gates

Phase 1 is not complete until the packaged Windows editor proves all of the following:

- The Scene Block Inspector remains stable at one reference panel.
- Normal rendering uses the WebGL sky pass and no CSS cloud/star background.
- Camera translation does not move the sky.
- Camera rotation changes the viewed world direction.
- The visible sun direction matches directional-light and shadow authority.
- Pointer-lock acquisition cannot restore a stale camera direction.
- The first pointer-lock delta and implausible movement spikes are rejected.
- Right-drag look remains smooth and bounded.
- Blur, visibility changes, and pointer-lock exit release navigation state cleanly.
- WASD, Space, Ctrl, Shift, Escape, selection, spline editing, Save, and all main panels remain responsive.
- Edit-mode night remains readable while Play-mode lighting remains authored.
- No WebGL errors, context loss, runaway requests, repeated Inspector mutation, or post-bootstrap event-loop stalls occur during the active soak.
