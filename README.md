# Worldbound

**A smart content engine for live events.** Perspective-based, audio-reactive
content generation with baked 3D screen mapping — think nDisplay/Unreal-style
viewpoint manipulation, but the content is *generated* from everything you set up
in the 3D viewport (screen size, resolution, position, perspective) and driven by
the music.

worldbound.ai

---

## What it does

1. **Previz the stage in 3D.** Build virtual screens that match the size,
   resolution and 3D position of your real-world LED walls. Group them and set a
   perspective eye point (globally or per-screen).
2. **Add the track.** Drop an audio file on the timeline. Worldbound analyses it
   for tempo, beats, an energy envelope and coarse song structure
   (intro / build / chorus / breakdown / finish).
3. **Prompt it.** Describe the look ("electric blue, angels descending into
   hell", etc.). Worldbound extracts a theme palette and motif.
4. **Generate.** It produces beat-synced, **seamless** loops (whole numbers of
   bars so they wrap on the grid), roughly 20–30s each, one per section, each
   **progressing** through the classic start → build → chorus → big-finish arc.
5. **Placed on the timeline.** Loops are laid out above the audio in the right
   positions so you can run the show without chasing timecode.
6. **Per-screen program feeds.** Every screen shows its final feed, **baked with
   its own perspective**.

### The key feature: baked 3D perspective for 2D content

Each screen is a *window into one shared 3D world*. Content is rendered per screen
using **generalized (off-axis) perspective projection** from the viewpoint through
that screen's quad — the same technique as CAVE/nDisplay. The result:

- Content flows **seamlessly across screens** based on their real position in 3D
  space, exactly as if you were looking through them into an Unreal world.
- Move the perspective eye and every screen re-bakes live.
- **Grouping controls mapping.** A `3D` group treats its screens as windows into
  the shared world. A `flat` group maps a single 2D image across all member
  screens as one contiguous surface. So even flat 2D content spans multiple
  screens as one.

## Output settings

Resolution (default **locked to each screen**, or a custom override), frame rate
(default **25**), colour profile (default **rec709**), codec (default
**NotchLC**, with **ProRes 4444** and **H.264** for fast dev exports) and bit
depth (**8** default, 10/12/16). "Export render manifest" writes the full
per-screen × per-loop render plan as JSON.

## Generation models

Everything shippable in the lightweight browser session uses the built-in
**Worldbound Procedural** generator (real-time GLSL, beat-synced, theme-aware —
zero dependencies). The model registry is ready to drive **open-source** video
models (AnimateDiff, Stable Video Diffusion, Deforum) from a GPU render backend;
those are listed and marked "backend required" until that service is connected.

## Tech

- **Vite + React + TypeScript**
- **three.js** + **@react-three/fiber** + **drei** for the 3D stage and off-axis
  rendering
- **Web Audio API** for dependency-free BPM/beat/energy analysis
- **zustand** for state

## Getting started

```bash
npm install
npm run gen:demo-track   # synthesises public/demo-track.wav (structured 120 BPM)
npm run dev              # http://localhost:5173
```

Then: **Load demo track** → **Generate content for full track** → **Play**. Drag
the red marker in the stage to move the perspective eye, or toggle a group between
`3D` and `Flat`.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on `0.0.0.0:5173` |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc` type-check only |
| `npm run gen:demo-track` | Generate the demo audio track |

## Project layout

```
src/
  audio/analyze.ts        Web Audio BPM/beat/energy/section analysis
  generation/             model registry, prompt parsing, loop generator
  render/
    world.ts              shared 3D content world (GLSL, audio-reactive)
    engine.ts             per-screen off-axis (3D) + ortho (flat) rendering
    geometry.ts           screen-corner maths
  components/             stage, timeline, panels, per-screen preview
  state/store.ts          zustand project state
scripts/generate-demo-track.mjs
```

## Roadmap

- GPU render backend for open-source diffusion video models
- ProRes/NotchLC encoding pipeline (ffmpeg / AVEncoder) at 10–16 bit
- Full-resolution offline render + Spout/NDI live output
- Per-screen viewpoint UI and warp/blend for curved walls
