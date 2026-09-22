# GPU plate worker

Worldbound is the **show tool** (stage, cameras, timeline, export). High-end
*generated* plates — Veo, Seedance, or ComfyUI diffusion — run on this worker.
Keys stay here; the browser never sees them.

The worker maps a looping MP4 onto the cinema **far plate**. nDisplay cameras
still bake every LED wall.

## In-browser (default, no GPU, no keys)

`Cinema 2.5D` plates already produce heavy live-event looks from the prompt
(fire vs grid vs figures, bloom, anamorphic streak, grain) and bake them
through nDisplay cameras. Use this unless you specifically need a generated
video plate.

## Google Veo

```bash
GEMINI_API_KEY=... npm run gpu-worker
```

Optional: `VEO_MODEL=veo-3.1-generate-preview` (Gemini `predictLongRunning`).
The UI model **Google Veo — video plate** becomes ready when `/health` reports
`veo: true`.

## ByteDance Seedance (fal.ai)

```bash
FAL_KEY=... npm run gpu-worker
```

Optional: `SEEDANCE_MODEL=bytedance/seedance-2.5/text-to-video`.
The UI model **ByteDance Seedance — video plate** becomes ready when `/health`
reports `seedance: true`.

## Open-source ComfyUI

1. Install [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on a machine
   with an NVIDIA GPU.
2. Add AnimateDiff, CogVideoX, or SVD nodes as you prefer.
3. Load `workers/comfyui/plate_loop.json` (SDXL stills → animated webp as a
   starter; swap in AnimateDiff for real motion).
4. On that machine:

```bash
COMFY_URL=http://127.0.0.1:8188 npm run gpu-worker
```

The Comfy enqueue path is still a stub until a GPU box is attached.

## Contract

- `GET /health` → `{ ok, veo, seedance, comfy, hint }`
- `POST /render` `{ prompt, seconds, fps, width, height, seed, model }`
  → `202 { jobId, status }`
- `GET /render/:jobId` until `{ status: "done", url }`
- `GET /plates/:id.mp4` served looping master

Vite proxies `/gpu` → `:8788`. The rest of Worldbound never depends on a GPU
or an API key.
