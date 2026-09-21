import { create } from "zustand";
import type {
  AudioAnalysis,
  ContentLoop,
  ExportedClip,
  ExportProgress,
  GenerationParams,
  GizmoMode,
  LyricsState,
  OutputSettings,
  ProjectState,
  Screen,
  ScreenGroup,
  Vec3,
  Viewpoint,
} from "../types";
import { parseLyrics } from "../lyrics/parse";

let idCounter = 1;
export const uid = (prefix: string) => `${prefix}-${idCounter++}`;

const defaultGroup: ScreenGroup = {
  id: "group-main",
  name: "Main Wall",
  mode: "world",
  color: "#38bdf8",
};

/**
 * Default stage previz: a centre wall flanked by two angled side walls, like a
 * typical VP / live LED stage. Positioned in 3D space so the baked perspective
 * makes content flow continuously across all three.
 */
const defaultScreens: Screen[] = [
  {
    id: "screen-left",
    name: "Left Wall",
    groupId: defaultGroup.id,
    resolution: { width: 1920, height: 1080 },
    size: { width: 6, height: 3.375 },
    position: [-6.4, 1.7, 2.2],
    rotation: [0, 35, 0],
  },
  {
    id: "screen-center",
    name: "Centre Wall",
    groupId: defaultGroup.id,
    resolution: { width: 3840, height: 2160 },
    size: { width: 10, height: 5.625 },
    position: [0, 1.9, 0],
    rotation: [0, 0, 0],
  },
  {
    id: "screen-right",
    name: "Right Wall",
    groupId: defaultGroup.id,
    resolution: { width: 1920, height: 1080 },
    size: { width: 6, height: 3.375 },
    position: [6.4, 1.7, 2.2],
    rotation: [0, -35, 0],
  },
];

const defaultViewpoint: Viewpoint = {
  position: [0, 1.7, 12],
  overrides: {},
};

const defaultOutput: OutputSettings = {
  resolutionMode: "locked",
  custom: { width: 3840, height: 2160 },
  fps: 25,
  colorProfile: "rec709",
  codec: "h264",
  bitDepth: 8,
};

const defaultLyrics: LyricsState = {
  source: "",
  lines: [],
  enabled: true,
  mode: "span",
  karaoke: true,
  showNext: true,
};

const defaultGeneration: GenerationParams = {
  prompt:
    "Create visuals that react to the tempo and beats, with an electric blue theme and graphics of angels descending into hell. Start, build, chorus, big finish.",
  modelId: "cinema",
  visualEngine: "cinema",
  palette: ["#00b3ff", "#0044ff", "#7df9ff", "#0a0f2c", "#ff2d55"],
  targetLoopSeconds: 24,
  targetLoopCount: 8,
  motif: "angels descending into hell",
};

export interface Store extends ProjectState {
  selectedScreenId: string | null;
  playhead: number; // seconds
  playing: boolean;
  isGenerating: boolean;
  showFrustums: boolean;
  gizmoMode: GizmoMode;
  exportProgress: ExportProgress;
  exportedClips: ExportedClip[];

  // selection / playback
  selectScreen: (id: string | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  toggleFrustums: () => void;
  setGizmoMode: (m: GizmoMode) => void;

  // screens & groups
  addScreen: () => void;
  duplicateScreen: (id: string) => void;
  removeScreen: (id: string) => void;
  updateScreen: (id: string, patch: Partial<Screen>) => void;
  addGroup: (mode: ScreenGroup["mode"]) => void;
  updateGroup: (id: string, patch: Partial<ScreenGroup>) => void;

  // viewpoint
  setViewpoint: (position: Vec3) => void;
  setViewpointOverride: (screenId: string, position: Vec3 | null) => void;

  // output
  updateOutput: (patch: Partial<OutputSettings>) => void;

  // audio
  setAudio: (name: string, url: string) => void;
  setAnalysis: (a: AudioAnalysis) => void;

  // generation
  updateGeneration: (patch: Partial<GenerationParams>) => void;
  setGenerating: (g: boolean) => void;
  setLoops: (loops: ContentLoop[]) => void;
  updateLyrics: (patch: Partial<LyricsState>) => void;
  setLyricsSource: (source: string, duration: number, barSec?: number) => void;

  // export
  setExportProgress: (p: Partial<ExportProgress>) => void;
  addExportedClips: (clips: ExportedClip[]) => void;
  clearExportedClips: () => void;
}

const groupPalette = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24", "#c084fc"];

export const useStore = create<Store>((set) => ({
  groups: [defaultGroup],
  screens: defaultScreens,
  viewpoint: defaultViewpoint,
  output: defaultOutput,
  audio: null,
  generation: defaultGeneration,
  loops: [],
  lyrics: defaultLyrics,

  selectedScreenId: "screen-center",
  playhead: 0,
  playing: false,
  isGenerating: false,
  showFrustums: true,
  gizmoMode: "eye",
  exportProgress: { active: false, label: "", current: 0, total: 0, error: null },
  exportedClips: [],

  selectScreen: (id) => set({ selectedScreenId: id }),
  setPlayhead: (t) => set({ playhead: t }),
  setPlaying: (p) => set({ playing: p }),
  toggleFrustums: () => set((s) => ({ showFrustums: !s.showFrustums })),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),

  addScreen: () =>
    set((s) => {
      const id = uid("screen");
      const n = s.screens.length;
      const screen: Screen = {
        id,
        name: `Screen ${n + 1}`,
        groupId: s.groups[0].id,
        resolution: { width: 1920, height: 1080 },
        size: { width: 5, height: 2.8125 },
        position: [n * 2 - 4, 1.7, 4],
        rotation: [0, 0, 0],
      };
      return { screens: [...s.screens, screen], selectedScreenId: id };
    }),

  duplicateScreen: (id) =>
    set((s) => {
      const src = s.screens.find((x) => x.id === id);
      if (!src) return {};
      const nid = uid("screen");
      const copy: Screen = {
        ...src,
        id: nid,
        name: `${src.name} copy`,
        position: [src.position[0] + 1, src.position[1], src.position[2]],
      };
      return { screens: [...s.screens, copy], selectedScreenId: nid };
    }),

  removeScreen: (id) =>
    set((s) => ({
      screens: s.screens.filter((x) => x.id !== id),
      selectedScreenId: s.selectedScreenId === id ? null : s.selectedScreenId,
    })),

  updateScreen: (id, patch) =>
    set((s) => ({
      screens: s.screens.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    })),

  addGroup: (mode) =>
    set((s) => {
      const id = uid("group");
      const g: ScreenGroup = {
        id,
        name: `Group ${s.groups.length + 1}`,
        mode,
        color: groupPalette[s.groups.length % groupPalette.length],
      };
      return { groups: [...s.groups, g] };
    }),

  updateGroup: (id, patch) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),

  setViewpoint: (position) =>
    set((s) => ({ viewpoint: { ...s.viewpoint, position } })),

  setViewpointOverride: (screenId, position) =>
    set((s) => {
      const overrides = { ...s.viewpoint.overrides };
      if (position === null) delete overrides[screenId];
      else overrides[screenId] = position;
      return { viewpoint: { ...s.viewpoint, overrides } };
    }),

  updateOutput: (patch) => set((s) => ({ output: { ...s.output, ...patch } })),

  setAudio: (name, url) =>
    set({ audio: { name, url, analysis: null }, loops: [], playhead: 0 }),

  setAnalysis: (analysis) =>
    set((s) => (s.audio ? { audio: { ...s.audio, analysis } } : {})),

  updateGeneration: (patch) =>
    set((s) => ({ generation: { ...s.generation, ...patch } })),

  setGenerating: (isGenerating) => set({ isGenerating }),
  setLoops: (loops) => set({ loops }),

  updateLyrics: (patch) => set((s) => ({ lyrics: { ...s.lyrics, ...patch } })),
  setLyricsSource: (source, duration, barSec = 2) =>
    set((s) => ({
      lyrics: {
        ...s.lyrics,
        source,
        lines: parseLyrics(source, duration, barSec),
        enabled: true,
      },
    })),

  setExportProgress: (p) =>
    set((s) => ({ exportProgress: { ...s.exportProgress, ...p } })),
  addExportedClips: (clips) =>
    set((s) => ({ exportedClips: [...s.exportedClips, ...clips] })),
  clearExportedClips: () =>
    set((s) => {
      for (const c of s.exportedClips) URL.revokeObjectURL(c.url);
      return { exportedClips: [] };
    }),
}));
