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

## Lyrics across screens

LED lyrics should **not** live in the 3D plates — perspective warps letters
between walls. Worldbound draws timed type onto a **spanning atlas** unfolded
left→right by each screen's physical width, then crops that atlas onto every
feed. The cinema look still parallaxes in 3D; the words read as one 2D surface.

- Paste **LRC** (`[mm:ss.xx]line`) or plain text (auto-timed to the track)
- **Span group** (default): one line across the array. Whole words are assigned
  to walls by physical width so bezels fall *between* words, never through a glyph.
- **Each screen**: the same full line on every wall
- **Karaoke wipe** fills the current line in time with the audio
- Demo track auto-loads demo lyrics

## High-end visuals (AE / Notch replacement)

Live-event content is usually **2D and heavy**, not a 3D game world. Worldbound
stays a **browser show tool** (the media server still plays the baked clips).
The default look is **Cinema 2.5D** — an After Effects / Notch-style comp:

- Five full-bleed plates parked *behind* the LED walls: nebula + hell mouth,
  volumetric haze, descending light-figures, energy ribbons, embers/bokeh.
  Layers sit in Z so nDisplay cameras see real parallax, like a media-server
  plate world.
- Each physical screen is still an nDisplay camera, so the 2D plates **flow
  across walls** when the group is in 3D mode. Flat groups composite as one 2D
  surface.
- A grade on every feed: wide bloom, anamorphic streak, chromatic aberration,
  cyan/magenta split-tone, grain, vignette.

That’s the in-browser path toward AE/Notch density, and it exports as real
H.264/ProRes. A GPU box is only needed if you want diffusion plates
(AnimateDiff / CogVideoX) instead of cinema shaders.

**Volumetric 3D** remains available for particle/volume worlds.

**Live program outputs.** Each screen’s baked feed can **pop out** to a
black capture window (or double-click fullscreen). Window-capture those in
OBS / Resolume / vMix — that’s the web stand-in for NDI/Spout until a native
sender exists. Opening a live window raises program resolution to 720p-tall.
`F` fullscreen in the pop-out, `H` hides the label, **Space** plays/pauses
the show.

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

Then: the **setup wizard** walks you through stage hang, audio, lyrics, look
and bake settings. **Generate & open stage** builds the 3D scene. After that,
**Play** (or **Space**). `W`/`E`/`R` to move/rotate/scale screens, `V` to move
the perspective eye. **Setup show** in the top bar reopens the wizard.
**Live** / **Pop out all** on Program Output to feed OBS/Resolume.
**Render usable graphics** (quick / preview) downloads baked H.264 clips.

Add `?setup=1` to the URL to force the wizard.

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
  lyrics/                 timed LRC, span layout, overlay
  setup/                  first-run wizard presets
  live/                   program pop-out windows (web NDI stand-in)
  components/             stage gizmos, timeline, panels, setup wizard
scripts/encode-server.mjs
scripts/gpu-worker.mjs
workers/comfyui/plate_loop.json
```

## Roadmap

- Native NDI/Spout sender (pop-out window-capture is the current web path)
- Native NotchLC encoder (currently ProRes 4444 stand-in)
- Prompt-driven motif variants (cinema stack still themed, palette-aware)
- Wire gpu-worker POST /prompt fully against a live ComfyUI + CogVideoX box
- Warp/blend for curved walls
