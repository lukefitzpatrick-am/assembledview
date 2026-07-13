import type { SceneQuad } from "@/lib/creative/homography"

export type TvSceneId = "tv-lounge-modern" | "tv-lounge-4k"

export type TvScene = {
  id: TvSceneId
  label: string
  src: string
  screen: SceneQuad
}

export const TV_SCENES: TvScene[] = [
  {
    id: "tv-lounge-modern",
    label: "Minimal white lounge (frontal)",
    src: "/mockups/tv-lounge-modern.jpg",
    // Calibrated 13 Jul 2026 against shipped photo (5568×3712).
    screen: {
      tl: [0.3671, 0.2982],
      tr: [0.7062, 0.2996],
      br: [0.7076, 0.59],
      bl: [0.3648, 0.587],
    },
  },
  {
    id: "tv-lounge-4k",
    label: "Netflix lounge (dark, cinematic)",
    src: "/mockups/tv-lounge-4k.jpg",
    // Calibrated 13 Jul 2026 against shipped photo (6217×4145).
    screen: {
      tl: [0.2496, 0.2166],
      tr: [0.755, 0.2181],
      br: [0.7502, 0.6434],
      bl: [0.2545, 0.6432],
    },
  },
]

export function getTvScene(id: TvSceneId): TvScene {
  const scene = TV_SCENES.find((item) => item.id === id)
  if (!scene) throw new Error(`Unknown TV scene: ${id}`)
  return scene
}
