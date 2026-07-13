"use client"

import { useEffect, useState } from "react"

import type { CreativeAsset } from "@/lib/creative/types"
import { mediaSrc } from "../social/shared"

const FRAME_FRACTIONS = [0.03, 0.33, 0.66, 0.97] as const
const FRAME_LABELS = ["Start", "Early", "Mid", "End"] as const

export type VideoFrameLabel = (typeof FRAME_LABELS)[number]

export function useVideoFrames(asset: CreativeAsset | null) {
  const [frames, setFrames] = useState<string[]>([])
  const [labels] = useState<VideoFrameLabel[]>([...FRAME_LABELS])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!asset || !asset.mime_type.startsWith("video/")) {
      setFrames([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    async function extract() {
      setLoading(true)
      setError(null)
      setFrames([])

      try {
        const response = await fetch(mediaSrc(asset!), { credentials: "include" })
        if (!response.ok) throw new Error("download_failed")
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)

        const video = document.createElement("video")
        video.muted = true
        video.playsInline = true
        video.preload = "auto"
        video.src = objectUrl

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve()
          video.onerror = () => reject(new Error("metadata_failed"))
        })

        if (!video.duration || !Number.isFinite(video.duration)) {
          throw new Error("zero_duration")
        }

        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("canvas_failed")

        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720

        const extracted: string[] = []

        for (const fraction of FRAME_FRACTIONS) {
          const time = Math.min(
            Math.max(fraction * video.duration, 0.05),
            Math.max(video.duration - 0.05, 0.05),
          )
          await seekVideo(video, time)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          extracted.push(canvas.toDataURL("image/jpeg", 0.92))
          if (cancelled) return
        }

        if (!cancelled) setFrames(extracted)
      } catch {
        if (!cancelled) {
          setError("Couldn't extract video frames. Try re-uploading as MP4 (H.264).")
          setFrames([])
        }
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        if (!cancelled) setLoading(false)
      }
    }

    void extract()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset?.id, asset?.mime_type])

  return { frames, labels, loading, error }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error("seek_failed"))
    }
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("error", onError)
    }
    video.addEventListener("seeked", onSeeked)
    video.addEventListener("error", onError)
    video.currentTime = time
  })
}

/** Capture a single JPEG frame from a video asset (for AVA copy). */
export async function captureVideoFrameDataUrl(asset: CreativeAsset): Promise<string> {
  const response = await fetch(mediaSrc(asset), { credentials: "include" })
  if (!response.ok) throw new Error("download_failed")
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  try {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.src = objectUrl

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error("metadata_failed"))
    })

    const time = Math.min(
      Math.max(0.03 * video.duration, 0.05),
      Math.max(video.duration - 0.05, 0.05),
    )
    await seekVideo(video, time)

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("canvas_failed")
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.92)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
