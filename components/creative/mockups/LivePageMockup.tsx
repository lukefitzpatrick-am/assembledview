"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Loader2, Move } from "lucide-react"
import { saveAs } from "file-saver"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CreativeAsset } from "@/lib/creative/types"
import { isHtml5Zip, isImage, isVideo, mediaSrc } from "./social/shared"

type LiveMockupSuccess = {
  imageDataUrl: string
  contentType: string
  provider: string
  tookMs: number
  hint?: string
  hostname: string
}

type OverlayRect = {
  x: number
  y: number
  width: number
  height: number
}

type LivePageMockupProps = {
  asset: CreativeAsset
  onUseBuiltInTemplates: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many live-page screenshots. Try again in a minute.",
  provider_not_configured:
    "Live page screenshots aren't configured yet. Add SCREENSHOTONE_ACCESS_KEY or use built-in templates.",
  provider_timeout: "Screenshot timed out — try again or use manual placement.",
  provider_blocked: "This page couldn't be captured. Try manual placement or a built-in template.",
  invalid_url: "That doesn't look like a valid https URL.",
  https_required: "Only https URLs are supported.",
  private_ip: "That address can't be used for live mockups.",
}

function hostnameFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "")
  } catch {
    return "page"
  }
}

function defaultOverlay(
  screenshotW: number,
  screenshotH: number,
  creativeW: number,
  creativeH: number,
): OverlayRect {
  const aspect = creativeW / creativeH
  const width = Math.min(creativeW, screenshotW * 0.45)
  const height = width / aspect
  return {
    x: (screenshotW - width) / 2,
    y: Math.min(screenshotH * 0.15, screenshotH - height - 16),
    width,
    height,
  }
}

export function LivePageMockup({ asset, onUseBuiltInTemplates }: LivePageMockupProps) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LiveMockupSuccess | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [overlay, setOverlay] = useState<OverlayRect | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const screenshotRef = useRef<HTMLImageElement | null>(null)
  const creativeRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const dragRef = useRef<{
    mode: "move" | "resize"
    startX: number
    startY: number
    rect: OverlayRect
  } | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
    setManualMode(false)
    setOverlay(null)
  }, [asset.id])

  async function captureScreenshot(mode: "inject" | "plain") {
    const trimmed = url.trim()
    if (!trimmed) {
      setError("Paste an https URL to preview.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/creative-assets/live-mockup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          mode,
          creative: {
            id: asset.id,
            mime_type: asset.mime_type,
            width_px: asset.width_px,
            height_px: asset.height_px,
            asset_name: asset.asset_name,
          },
        }),
      })

      const data = (await response.json()) as LiveMockupSuccess & {
        error?: string
        message?: string
        image?: string
      }

      if (!response.ok) {
        const code = data.error ?? "provider_blocked"
        setError(data.message ?? ERROR_MESSAGES[code] ?? ERROR_MESSAGES.provider_blocked)
        return
      }

      if (!data.image) {
        setError("Screenshot returned empty. Try manual placement or a built-in template.")
        return
      }

      const mime = data.contentType?.startsWith("image/") ? data.contentType : "image/jpeg"
      const imageDataUrl = `data:${mime};base64,${data.image}`

      setResult({
        imageDataUrl,
        contentType: mime,
        provider: data.provider,
        tookMs: data.tookMs,
        hint: data.hint,
        hostname: hostnameFromUrl(trimmed),
      })
      setManualMode(false)
      setOverlay(null)

      if (data.hint) {
        setManualMode(true)
      }
    } catch {
      setError("This page couldn't be captured. Try manual placement or a built-in template.")
    } finally {
      setLoading(false)
    }
  }

  const paintManual = useCallback(() => {
    const canvas = canvasRef.current
    const shot = screenshotRef.current
    const creative = creativeRef.current
    if (!canvas || !shot || !shot.complete || shot.naturalWidth === 0) return

    canvas.width = shot.naturalWidth
    canvas.height = shot.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(shot, 0, 0)

    if (overlay && creative && creative instanceof HTMLImageElement && creative.complete) {
      ctx.drawImage(creative, overlay.x, overlay.y, overlay.width, overlay.height)
    } else if (overlay && creative instanceof HTMLVideoElement && creative.readyState >= 2) {
      ctx.drawImage(creative, overlay.x, overlay.y, overlay.width, overlay.height)
    }
  }, [overlay])

  useEffect(() => {
    if (!manualMode || !result) return

    let cancelled = false
    const shot = new Image()
    shot.onload = () => {
      if (cancelled) return
      screenshotRef.current = shot
      setOverlay((prev) =>
        prev ??
        defaultOverlay(shot.naturalWidth, shot.naturalHeight, asset.width_px, asset.height_px),
      )
    }
    shot.src = result.imageDataUrl

    return () => {
      cancelled = true
    }
  }, [manualMode, result, asset.width_px, asset.height_px])

  useEffect(() => {
    if (!manualMode || !overlay) return

    if (isImage(asset.mime_type)) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        creativeRef.current = img
        paintManual()
      }
      img.src = mediaSrc(asset)
      return
    }

    if (isVideo(asset.mime_type)) {
      const video = document.createElement("video")
      video.crossOrigin = "anonymous"
      video.muted = true
      video.playsInline = true
      video.onloadeddata = () => {
        creativeRef.current = video
        paintManual()
      }
      video.src = mediaSrc(asset)
    }
  }, [manualMode, overlay, asset, paintManual])

  useEffect(() => {
    paintManual()
  }, [overlay, paintManual])

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  function hitResizeHandle(point: { x: number; y: number }, rect: OverlayRect): boolean {
    const handle = 24
    return (
      point.x >= rect.x + rect.width - handle &&
      point.x <= rect.x + rect.width + handle / 2 &&
      point.y >= rect.y + rect.height - handle &&
      point.y <= rect.y + rect.height + handle / 2
    )
  }

  function downloadScreenshot() {
    if (!result) return
    const safeName = asset.asset_name.replace(/[^\w.-]+/g, "-").slice(0, 80)
    saveAs(result.imageDataUrl, `${safeName}-${result.hostname}-mockup.jpg`)
  }

  function downloadManualPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    paintManual()
    canvas.toBlob((blob) => {
      if (!blob || !result) return
      const safeName = asset.asset_name.replace(/[^\w.-]+/g, "-").slice(0, 80)
      saveAs(blob, `${safeName}-${result.hostname}-mockup.png`)
    }, "image/png")
  }

  async function enterManualMode() {
    if (!result) {
      await captureScreenshot("plain")
      setManualMode(true)
      return
    }
    setManualMode(true)
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!overlay) return
    const point = canvasPoint(event)
    const mode = hitResizeHandle(point, overlay) ? "resize" : "move"
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...overlay },
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    const canvas = canvasRef.current
    if (!drag || !canvas) return

    const scaleX = canvas.width / canvas.clientWidth
    const scaleY = canvas.height / canvas.clientHeight
    const dx = (event.clientX - drag.startX) * scaleX
    const dy = (event.clientY - drag.startY) * scaleY

    if (drag.mode === "move") {
      setOverlay({
        ...drag.rect,
        x: drag.rect.x + dx,
        y: drag.rect.y + dy,
      })
      return
    }

    const aspect = asset.width_px / asset.height_px
    const newWidth = Math.max(40, drag.rect.width + dx)
    setOverlay({
      ...drag.rect,
      width: newWidth,
      height: newWidth / aspect,
    })
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const html5Zip = isHtml5Zip(asset.mime_type)

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
      <div className="rounded-card border border-border bg-card p-4 shadow-e1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="live-page-url">Live page URL</Label>
            <Input
              id="live-page-url"
              type="url"
              inputMode="url"
              placeholder="https://www.example.com/article…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void captureScreenshot("inject")
                }
              }}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Captures a real screenshot in AU Chrome and injects your{" "}
              <span className="num">
                {asset.width_px}×{asset.height_px}
              </span>{" "}
              creative into detected ad slots. Use manual placement if injection isn&apos;t visible.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void captureScreenshot("inject")}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Capturing…
              </>
            ) : (
              "Capture page"
            )}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-card border border-border bg-card p-4 text-sm text-foreground shadow-e0">
          <p className="font-medium text-status-critical-fg">Couldn&apos;t capture live page</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={onUseBuiltInTemplates}
          >
            Use built-in templates
          </Button>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-input border border-border bg-surface-panel px-3 py-2 text-sm text-muted-foreground">
            <p>
              Creative placed into detected ad slots — if you don&apos;t see it, use manual
              placement. Captured in{" "}
              <span className="num text-foreground">{Math.round(result.tookMs / 1000)}s</span> via{" "}
              {result.provider}.
            </p>
            {result.hint ? <p className="text-foreground">{result.hint}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={downloadScreenshot}>
              <Download className="mr-2 size-4" aria-hidden />
              Download screenshot
            </Button>
            <Button
              type="button"
              variant={manualMode ? "default" : "secondary"}
              size="sm"
              onClick={() => void enterManualMode()}
              disabled={html5Zip}
            >
              <Move className="mr-2 size-4" aria-hidden />
              Place manually
            </Button>
            {manualMode ? (
              <Button type="button" size="sm" onClick={downloadManualPng}>
                <Download className="mr-2 size-4" aria-hidden />
                Export composite PNG
              </Button>
            ) : null}
          </div>

          {manualMode ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Drag the creative to reposition. Use the handle on the bottom-right corner to
                resize (aspect ratio locked).
              </p>
              <div className="max-h-[min(70vh,900px)] overflow-auto rounded-card border border-border bg-card shadow-e1">
                <canvas
                  ref={canvasRef}
                  className="max-w-full cursor-move"
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerLeave={pointerUp}
                />
              </div>
            </div>
          ) : (
            <div className="max-h-[min(70vh,900px)] overflow-auto rounded-card border border-border bg-card shadow-e1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.imageDataUrl}
                alt="Live page screenshot mockup"
                className="w-full"
              />
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
