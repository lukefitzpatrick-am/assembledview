"use client"

import { useState } from "react"
import { GalleryHorizontal, Image as ImageIcon, Play, Video } from "lucide-react"

import type { CreativeFormatHint } from "@/lib/creative/performance/metrics"
import { cn } from "@/lib/utils"

const KIND_LABEL = {
  video: "Video",
  image: "Image",
  carousel: "Carousel",
} as const

type ThumbSize = "card" | "row" | "panel"

const IMAGE_BOX: Record<ThumbSize, string> = {
  card: "w-24 aspect-[4/5]",
  row: "size-10",
  panel: "w-full",
}

const TILE_BOX: Record<ThumbSize, string> = {
  card: "size-24",
  row: "size-10",
  panel: "h-48 w-full",
}

function aspectStyle(aspect: string | null): { aspectRatio: string; width?: string; height?: string } {
  const match = aspect?.match(/^(\d+):(\d+)$/)
  if (!match) return { aspectRatio: "1 / 1", width: "72%", height: "auto" }
  const w = Number(match[1])
  const h = Number(match[2])
  if (!w || !h) return { aspectRatio: "1 / 1", width: "72%", height: "auto" }
  return w >= h
    ? { aspectRatio: `${w} / ${h}`, width: "100%", height: "auto" }
    : { aspectRatio: `${w} / ${h}`, width: "auto", height: "100%" }
}

function KindIcon({ kind }: { kind: CreativeFormatHint["kind"] }) {
  const className = "h-4 w-4 text-muted-foreground"
  if (kind === "video") return <Video className={className} aria-hidden />
  if (kind === "carousel") return <GalleryHorizontal className={className} aria-hidden />
  return <ImageIcon className={className} aria-hidden />
}

function FormatTile({ format, size }: { format: CreativeFormatHint; size: ThumbSize }) {
  const frame = aspectStyle(format.aspect)
  const label = format.kind ? KIND_LABEL[format.kind] : "Ad"
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-input bg-surface-panel", TILE_BOX[size])}
      data-creative-preview="none"
    >
      <div
        className="flex max-h-full max-w-full items-center justify-center rounded-input border border-border bg-muted"
        style={frame}
      >
        {size === "row" ? (
          <KindIcon kind={format.kind} />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <KindIcon kind={format.kind} />
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Cached preview through the tenant-checked image route, or the format tile
 * when there is no preview or the image fails to load.
 */
export function CreativeFormatThumb({
  format,
  previewUrl,
  previewKind,
  size,
  name,
}: {
  format: CreativeFormatHint
  previewUrl: string | null
  previewKind?: "image" | "video" | null
  size: ThumbSize
  name?: string | null
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!previewUrl || failedSrc === previewUrl) return <FormatTile format={format} size={size} />

  const isVideo = previewKind === "video" || (previewKind == null && format.kind === "video")
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-input bg-surface-panel", IMAGE_BOX[size])}
      data-creative-preview="image"
    >
      {/* Same-origin image route; next/image adds nothing with images.unoptimized. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt={name?.trim() || "Ad preview"}
        loading={size === "panel" ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailedSrc(previewUrl)}
        className={cn(
          "rounded-input",
          size === "panel" ? "max-h-[60vh] w-full object-contain" : "h-full w-full object-cover",
        )}
      />
      {isVideo ? (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-pill bg-background/90 text-foreground shadow-e1",
            size === "row" ? "bottom-0.5 right-0.5 size-4" : "bottom-1.5 right-1.5 size-7",
          )}
          data-creative-play="true"
        >
          <Play className={size === "row" ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} aria-hidden />
          <span className="sr-only">Video</span>
        </span>
      ) : null}
    </div>
  )
}
