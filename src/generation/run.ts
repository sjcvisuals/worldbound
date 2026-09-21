import { parsePrompt } from "./prompt";
import { generateLoops } from "./generate";
import { useStore } from "../state/store";

export function generateFromStore(): { ok: boolean; status: string; count: number } {
  const st = useStore.getState();
  if (!st.audio?.analysis) {
    return { ok: false, status: "Load and analyse an audio track first.", count: 0 };
  }
  const parsed = parsePrompt(st.generation.prompt);
  const params = { ...st.generation, palette: parsed.palette, motif: parsed.motif };
  st.updateGeneration({ palette: parsed.palette, motif: parsed.motif });
  const generated = generateLoops(st.audio.analysis, params);
  st.setLoops(generated);
  return {
    ok: true,
    status: `Generated ${generated.length} seamless loops · ${generated[0]?.bars ?? 0} bars each`,
    count: generated.length,
  };
}
