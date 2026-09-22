import type { Screen, Vec3 } from "../types";

export const MAIN_GROUP_ID = "group-main";

export interface StagePreset {
  id: string;
  name: string;
  blurb: string;
  viewpoint: Vec3;
  screens: Screen[];
}

function wall(
  id: string,
  name: string,
  res: [number, number],
  size: [number, number],
  position: Vec3,
  rotation: Vec3
): Screen {
  return {
    id,
    name,
    groupId: MAIN_GROUP_ID,
    resolution: { width: res[0], height: res[1] },
    size: { width: size[0], height: size[1] },
    position,
    rotation,
  };
}

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: "wrap",
    name: "Concert wrap",
    blurb: "Centre LED plus two angled side walls. Content flows across the array.",
    viewpoint: [0, 1.7, 12],
    screens: [
      wall("screen-left", "Left Wall", [1920, 1080], [6, 3.375], [-6.4, 1.7, 2.2], [0, 35, 0]),
      wall("screen-center", "Centre Wall", [3840, 2160], [10, 5.625], [0, 1.9, 0], [0, 0, 0]),
      wall("screen-right", "Right Wall", [1920, 1080], [6, 3.375], [6.4, 1.7, 2.2], [0, -35, 0]),
    ],
  },
  {
    id: "single",
    name: "Single wall",
    blurb: "One 16:9 LED backdrop — club, lecture, or IMAG.",
    viewpoint: [0, 2, 14],
    screens: [wall("screen-center", "Main Wall", [3840, 2160], [12, 6.75], [0, 2, 0], [0, 0, 0])],
  },
  {
    id: "imag",
    name: "Dual IMAG",
    blurb: "Matching left and right screens. Same picture on both.",
    viewpoint: [0, 1.7, 12],
    screens: [
      wall("screen-left", "Left IMAG", [1920, 1080], [6, 3.375], [-5.5, 1.8, 1.2], [0, 18, 0]),
      wall("screen-right", "Right IMAG", [1920, 1080], [6, 3.375], [5.5, 1.8, 1.2], [0, -18, 0]),
    ],
  },
  {
    id: "ultrawide",
    name: "Ultra-wide banner",
    blurb: "One long 32:9 wall — festival header or stage fascia.",
    viewpoint: [0, 1.6, 16],
    screens: [wall("screen-center", "Banner", [3840, 1080], [20, 5.625], [0, 1.8, 0], [0, 0, 0])],
  },
];

export function presetById(id: string): StagePreset {
  return STAGE_PRESETS.find((p) => p.id === id) ?? STAGE_PRESETS[0];
}

export const LOOK_CHIPS: { label: string; prompt: string }[] = [
  {
    label: "Electric blue angels",
    prompt:
      "Create visuals that react to the tempo and beats, with an electric blue theme and graphics of angels descending into hell. Start, build, chorus, big finish.",
  },
  {
    label: "Gold fire",
    prompt:
      "Gold and amber fire, embers and a hell mouth that punch on the kick. Start dark, build heat, chorus ignites, big finish.",
  },
  {
    label: "Cyan grid",
    prompt:
      "Cyan grid tunnel and neon geometry, clean festival look. Waves of light on the beat, dark verses, bright chorus.",
  },
  {
    label: "Magenta lightning",
    prompt:
      "Magenta and violet lightning, smoke and particles. Storm builds with the track, chorus is a full strike.",
  },
];
