import type { SceneQuad } from "@/lib/creative/homography"

export type TvSceneId = "tv-lounge-modern" | "tv-lounge-4k"

export type TvScene = {
  id: TvSceneId
  label: string
  src: string
  screen: SceneQuad
  /** Shown in picker when the source photo is low resolution. */
  qualityNote?: string
}

export const TV_SCENES: TvScene[] = [
  {
    id: "tv-lounge-modern",
    label: "Modern lounge (frontal)",
    src: "/mockups/tv-lounge-modern.jpg",
    screen: {
      tl: [0.318, 0.042],
      tr: [0.699, 0.043],
      br: [0.698, 0.427],
      bl: [0.318, 0.426],
    },
  },
  {
    id: "tv-lounge-4k",
    label: "Angled room (soft — low-res photo)",
    src: "/mockups/tv-lounge-4k.jpg",
    qualityNote: "Source photo is low resolution — export may look soft.",
    screen: {
      tl: [0.115, 0.17],
      tr: [0.516, 0.108],
      br: [0.52, 0.5],
      bl: [0.117, 0.56],
    },
  },
]

export function getTvScene(id: TvSceneId): TvScene {
  const scene = TV_SCENES.find((item) => item.id === id)
  if (!scene) throw new Error(`Unknown TV scene: ${id}`)
  return scene
}
