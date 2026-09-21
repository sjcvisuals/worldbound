# GPU plate worker

Worldbound is the **show tool** (stage, cameras, timeline, export). High-end
*generated* plates — the After Effects / Notch replacement when you want
diffusion rather than cinema shaders — run on a GPU box.

## In-browser (default, no GPU)

`Cinema 2.5D` plates already produce heavy live-event looks (nebula, haze,
figures, energy ribbons, embers, bloom, anamorphic streak, grain) and bake
them through nDisplay cameras. Use this unless you specifically need
photoreal diffusion.

## Diffusion plates (GPU)

1. Install [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on a machine
   with an NVIDIA GPU.
2. Add AnimateDiff, CogVideoX, or SVD nodes as you prefer.
3. Load `workers/comfyui/plate_loop.json` (SDXL stills → animated webp as a
   starter; swap in AnimateDiff for real motion).
4. On that machine:

```bash
COMFY_URL=http://127.0.0.1:8188 npm run gpu-worker
```

5. Point the Worldbound UI at it (`/gpu` is proxied in Vite). The UI stays in
   the browser; only plate generation leaves.

The worker will 501 until ComfyUI is reachable, so the rest of Worldbound
never depends on a GPU.
