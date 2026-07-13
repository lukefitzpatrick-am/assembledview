"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { saveAs } from "file-saver"

import { Button } from "@/components/ui/button"
import type { CreativeAsset } from "@/lib/creative/types"
import { drawImagePerspective, quadToPoints } from "@/lib/creative/homography"
import { cn } from "@/lib/utils"
import { Html5Notice, isHtml5Zip, isImage, isVideo, mediaSrc } from "../social/shared"
import { TV_SCENES, type TvSceneId } from "./sceneTemplates"
import { useVideoFrames } from "./useVideoFrames"

type TvSceneMockupProps = {
  asset: CreativeAsset
}

export function TvSceneMockup({ asset }: TvSceneMockupProps) {
  const [sceneId, setSceneId] = useState<TvSceneId>("tv-lounge-modern")
  const [frameIndex, setFrameIndex] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneImageRef = useRef<HTMLImageElement | null>(null)
  const frameImageRef = useRef<HTMLImageElement | null>(null)
  const [sceneLoaded, setSceneLoaded] = useState(false)
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [sceneError, setSceneError] = useState(false)

  const scene = TV_SCENES.find((item) => item.id === sceneId) ?? TV_SCENES[0]
  const isVideoAsset = isVideo(asset.mime_type)
  const { frames, labels, loading: framesLoading, error: framesError } = useVideoFrames(
    isVideoAsset ? asset : null,
  )

  const activeFrameSrc = isVideoAsset
    ? frames[frameIndex] ?? null
    : isImage(asset.mime_type)
      ? mediaSrc(asset)
      : null

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const sceneImg = sceneImageRef.current
    const frameImg = frameImageRef.current
    if (!canvas || !sceneImg || !sceneImg.complete || sceneImg.naturalWidth === 0) return

    canvas.width = sceneImg.naturalWidth
    canvas.height = sceneImg.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(sceneImg, 0, 0)

    if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
      const destQuad = quadToPoints(scene.screen, canvas.width, canvas.height)
      drawImagePerspective(
        ctx,
        frameImg,
        frameImg.naturalWidth,
        frameImg.naturalHeight,
        destQuad,
        { vignette: true },
      )
    }
  }, [scene.screen])

  useEffect(() => {
    setSceneLoaded(false)
    setSceneError(false)
    const img = new Image()
    img.onload = () => {
      sceneImageRef.current = img
      setSceneLoaded(true)
      paint()
    }
    img.onerror = () => {
      sceneImageRef.current = null
      setSceneError(true)
    }
    img.src = scene.src
  }, [scene.src, paint])

  useEffect(() => {
    if (!activeFrameSrc) {
      frameImageRef.current = null
      setFrameLoaded(false)
      paint()
      return
    }

    setFrameLoaded(false)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      frameImageRef.current = img
      setFrameLoaded(true)
      paint()
    }
    img.onerror = () => {
      frameImageRef.current = null
      paint()
    }
    img.src = activeFrameSrc
  }, [activeFrameSrc, paint])

  useEffect(() => {
    paint()
  }, [sceneLoaded, frameLoaded, paint])

  function handleSceneClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (process.env.NODE_ENV !== "development") return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    console.info(`[tv-scene-calibrate] [${x.toFixed(4)}, ${y.toFixed(4)}]`)
  }

  async function downloadFrame(label: string) {
    const canvas = canvasRef.current
    if (!canvas) return
    paint()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    canvas.toBlob((blob) => {
      if (!blob) return
      const safeName = asset.asset_name.replace(/[^\w.-]+/g, "-").slice(0, 80)
      saveAs(blob, `${safeName}-tv-lounge-${label.toLowerCase().replace(/\s+/g, "-")}.png`)
    }, "image/png")
  }

  if (isHtml5Zip(asset.mime_type)) {
    return (
      <div className="mx-auto max-w-[960px]">
        <Html5Notice className="min-h-[240px] rounded-card border border-border" />
      </div>
    )
  }

  if (!isImage(asset.mime_type) && !isVideo(asset.mime_type)) {
    return (
      <div className="mx-auto max-w-[960px] rounded-card border border-border bg-card p-6 text-sm text-muted-foreground">
        TV scene mockups support image and video creatives only.
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 lg:flex-row">
      <aside className="shrink-0 space-y-4 lg:w-[240px]">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scene</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {TV_SCENES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "interactive rounded-input border border-border bg-card p-2 text-left text-xs",
                  item.id === sceneId && "ring-2 ring-ring",
                )}
                onClick={() => setSceneId(item.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  alt=""
                  className="mb-2 aspect-video w-full rounded-input object-cover"
                />
                <span className="font-medium text-foreground">{item.label}</span>
                {item.qualityNote ? (
                  <span className="mt-1 block text-muted-foreground">{item.qualityNote}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {isVideoAsset ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Frame
            </p>
            {framesLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Extracting frames…
              </p>
            ) : framesError ? (
              <p className="text-sm text-status-critical-fg">{framesError}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {frames.map((frame, index) => (
                    <button
                      key={labels[index]}
                      type="button"
                      className={cn(
                        "interactive overflow-hidden rounded-input border border-border",
                        index === frameIndex && "ring-2 ring-ring",
                      )}
                      onClick={() => setFrameIndex(index)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frame} alt="" className="aspect-video w-full object-cover" />
                      <span className="block px-1 py-1 text-[10px] text-muted-foreground">
                        {labels[index]}
                      </span>
                    </button>
                  ))}
                </div>
                {frames.length >= 2 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      const prev = frameIndex
                      await downloadFrame(labels[0])
                      setFrameIndex(frames.length - 1)
                      await new Promise((r) => setTimeout(r, 100))
                      await downloadFrame(labels[frames.length - 1])
                      setFrameIndex(prev)
                    }}
                  >
                    Download start &amp; end
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <Button
          type="button"
          className="w-full"
          disabled={!sceneLoaded || sceneError || (isVideoAsset && !activeFrameSrc)}
          onClick={() => void downloadFrame(isVideoAsset ? labels[frameIndex] : "frame")}
        >
          <Download className="mr-2 size-4" aria-hidden />
          Download PNG
        </Button>
      </aside>

      <div className="min-w-0 flex-1">
        {sceneError ? (
          <div className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground">
            Scene photo missing at <code className="text-foreground">{scene.src}</code>. Add the
            lounge photo to <code className="text-foreground">public/mockups/</code>.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full rounded-card border border-border bg-card shadow-e1"
            onClick={handleSceneClick}
          />
        )}
      </div>
    </div>
  )
}
