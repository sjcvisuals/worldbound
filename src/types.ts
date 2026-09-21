// Core domain model for the Worldbound content engine.

export type Vec3 = [number, number, number];

/** A screen group determines how content maps across its member screens. */
export interface ScreenGroup {
  id: string;
  name: string;
  /**
   * - "world": screens are windows into a shared 3D world. Content is rendered
   *   with a baked 3D perspective (nDisplay-style off-axis projection) from the
   *   viewpoint, so it flows seamlessly across screens based on their real
   *   position in 3D space.
   * - "flat": screens are treated as one contiguous 2D canvas. Flat content is
   *   mapped across the combined bounding rectangle of the group as if the
   *   screens were a single surface.
   */
  mode: "world" | "flat";
  color: string;
}

/** A physical LED/screen surface, previz'd in 3D space like an nDisplay stage. */
export interface Screen {
  id: string;
  name: string;
  groupId: string;
  /** Output resolution in pixels. */
  resolution: { width: number; height: number };
  /** Physical size in metres (drives real-world scale + perspective). */
  size: { width: number; height: number };
  /** Centre position in 3D space (metres). */
  position: Vec3;
  /** Rotation in degrees (Euler XYZ). */
  rotation: Vec3;
}

/** The perspective / eye point that content is baked for. */
export interface Viewpoint {
  /** Global eye position in 3D space (metres). */
  position: Vec3;
  /**
   * Per-screen viewpoint overrides. When a screen id is present here, its
   * content is baked from this eye position instead of the global one.
   */
  overrides: Record<string, Vec3>;
}

export type Codec = "notchlc" | "prores" | "h264";
export type ColorProfile = "rec709" | "rec2020" | "srgb" | "p3";
export type BitDepth = 8 | 10 | 12 | 16;

export interface OutputSettings {
  /** "locked" derives resolution per-screen; "custom" forces a single size. */
  resolutionMode: "locked" | "custom";
  custom: { width: number; height: number };
  fps: number;
  colorProfile: ColorProfile;
  codec: Codec;
  bitDepth: BitDepth;
}

export interface AudioSection {
  type: SongSectionType;
  startSec: number;
  endSec: number;
}

export interface AudioAnalysis {
  duration: number;
  bpm: number;
  /** Beat onset times in seconds. */
  beats: number[];
  /** Normalised energy envelope sampled at `envelopeHz`. */
  envelope: number[];
  envelopeHz: number;
  sections: AudioSection[];
}

export interface AudioTrack {
  name: string;
  url: string;
  analysis: AudioAnalysis | null;
}

export type SongSectionType = "intro" | "build" | "chorus" | "breakdown" | "finish";

export interface GenerationModel {
  id: string;
  label: string;
  kind: "builtin" | "backend";
  /** Whether the model can run in the current lightweight browser session. */
  available: boolean;
  description: string;
  openSource: boolean;
}

export interface GenerationParams {
  prompt: string;
  modelId: string;
  /** Extracted / chosen theme palette (hex colours). */
  palette: string[];
  /** Target seconds per loop (loops are quantised to whole bars for seamlessness). */
  targetLoopSeconds: number;
  /** Desired number of loops (actual count adapts to track length + bars). */
  targetLoopCount: number;
  /** Free-text motif extracted from the prompt, shown back to the user. */
  motif: string;
}

/** A generated, seamless, beat-synced content loop placed on the timeline. */
export interface ContentLoop {
  id: string;
  index: number;
  section: SongSectionType;
  startSec: number;
  endSec: number;
  lengthSec: number;
  bars: number;
  /** 0..1 progression through the whole show; drives evolving visuals. */
  progression: number;
  /** Visual parameters consumed by the renderer/shader. */
  visual: LoopVisual;
}

export interface LoopVisual {
  seed: number;
  palette: string[];
  /** 0..1 overall intensity (energy of the section). */
  intensity: number;
  /** Motion speed multiplier. */
  speed: number;
  /** Density of graphical elements. */
  density: number;
  /** 0..1 how much beats punch the visuals. */
  beatPunch: number;
  /** Named visual motif preset. */
  motif: string;
}

export interface ProjectState {
  groups: ScreenGroup[];
  screens: Screen[];
  viewpoint: Viewpoint;
  output: OutputSettings;
  audio: AudioTrack | null;
  generation: GenerationParams;
  loops: ContentLoop[];
}
