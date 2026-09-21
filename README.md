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
   positions so you can run the show without chasing timecode. Visual motion
   wraps on the loop length so clips are **seamless**.
6. **Render usable graphics.** Each screen × loop is encoded as H.264 (in-browser
   WebCodecs) at the locked resolution, baked with that screen's perspective.
   Optional `npm run encode-server` transcodes to ProRes; NotchLC requests use
   ProRes 4444 as the closest open master (NotchLC itself is proprietary).

### The key feature: baked 3D perspective for 2D content

Each screen is a *window into one shared 3D world*. Content is rendered per screen
using **generalized (off-axis) perspective projection** from the viewpoint through
that screen's quad — the same technique as CAVE/nDisplay. The result:

- Content flows **seamlessly across screens** based on their real position in 3D
  space, exactly as if you were looking through them into an Unreal world.
- Move the perspective eye and every screen re-bakes live. Screens can share one
  global eye or use an **independent** eye per screen.
- **Unreal-style gizmos.** `W` move / `E` rotate / `R` scale selected screens;
  `V` moves the perspective eye.
- **Grouping controls mapping.** A `3D` group treats its screens as windows into
  the shared world. A `flat` group maps a single 2D image across all member
  screens as one contiguous surface. So even flat 2D content spans multiple
  screens as one.

## Output settings

Resolution (default **locked to each screen**, or a custom override), frame rate
(default **25**), colour profile (default **rec709**), codec (default **NotchLC**,
with **ProRes** and **H.264**), bit depth (**8** default, 10/12/16).

**Render usable graphics** writes one clip per screen (zipped if more than one):

| Quality | Cap |
| --- | --- |
| Preview | longest side 960 |
| Delivery | longest side 1920 |
| Full | native, up to 4K |

| Scope | What gets rendered |
| --- | --- |
| Quick clip | 4 seconds of the loop under the playhead, all screens |
| Current loop | that loop’s full length |
| All loops | every loop × every screen |

H.264 is always produced in-browser. If the encode sidecar is running, ProRes /
NotchLC-stand-in transcode happens automatically.

## High-end visuals (AE / Notch replacement)

Live-event content is usually **2D and heavy**, not a 3D game world. Worldbound
stays a **browser show tool**. The default look is **Cinema 2.5D**:

- A stack of full-bleed plates parked *behind* the LED walls (nebula / hell
  mouth, descending angels, embers) — the same idea as an After Effects comp
  with layers in Z.
- Each physical screen is still an nDisplay camera, so the 2D plates **parallax
  across walls** when the group is in 3D mode. Flat groups composite as one 2D
  surface.
- A grade on every feed: bloom, anamorphic streak, chromatic aberration, grain,
  vignette.

That’s the in-browser path toward Notch/AE density, and it exports as real
H.264/ProRes.

**Volumetric 3D** remains available for particle/volume worlds.

**Diffusion plates** (AnimateDiff, CogVideoX, SVD) are an optional GPU worker
(`npm run gpu-worker` + ComfyUI on an NVIDIA box). See `workers/README.md`.
The UI never requires a GPU.

## Generation models

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
npm run encode-server    # optional: ffmpeg sidecar for ProRes (port 8787)
npm run dev              # http://localhost:5173
```

Then: **Load demo track** → **Generate content for full track** → **Play**.
`W`/`E`/`R` to move/rotate/scale screens, `V` to move the perspective eye.
**Render usable graphics** (quick / preview) downloads baked H.264 clips.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on `0.0.0.0:5173` |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc` type-check only |
| `npm run gen:demo-track` | Generate the demo audio track |
| `npm run encode-server` | ffmpeg sidecar (ProRes / NotchLC-stand-in) on :8787 |
| `npm run gpu-worker` | Optional ComfyUI front-end (diffusion plates) on :8788 |

## Project layout

```
src/
  audio/analyze.ts        Web Audio BPM/beat/energy/section analysis
  generation/             models, prompt parsing, loop generator, GPU client
  render/
    cinema/               AE-style 2.5D plates + bloom/CA grade
    world.ts              volumetric 3D world (optional look)
    engine.ts             nDisplay bake + post
    exportPipeline.ts     offline baked-clip renderer
  components/             stage gizmos, timeline, panels
scripts/encode-server.mjs
scripts/gpu-worker.mjs
workers/comfyui/plate_loop.json
```

## Roadmap

- Wire gpu-worker POST /prompt fully against a live ComfyUI + CogVideoX box
- Native NotchLC encoder (currently ProRes 4444 stand-in)
- Spout/NDI live output to media servers
- Warp/blend for curved walls
