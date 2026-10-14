import { GalleryHorizontal, Image as ImageIcon, Video } from "lucide-react"

import type { CreativeFormatHint } from "@/lib/creative/performance/metrics"
import { cn } from "@/lib/utils"

/** `none` is the format frame. `image` is the P5 preview hook. */
export type CreativePreview =
  | { status: "none" }
  | { status: "image"; src: string }

const KIND_LABEL = {
  video: "Video",
  image: "Image",
  carousel: "Carousel",
} as const

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

export function CreativeFormatThumb({
  format,
  preview,
  size,
  name,
}: {
  format: CreativeFormatHint
  preview: CreativePreview
  size: "card" | "row"
  name?: string | null
}) {
  const box = size === "card" ? "size-24" : "size-11"
  if (preview.status === "image") {
    return (
      <div
        className={cn("shrink-0 overflow-hidden rounded-input bg-surface-panel", box)}
        data-creative-preview="image"
      >
        {/* P5 fills this branch. Preview URLs are not app image assets. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview.src} alt={name?.trim() || ""} className="h-full w-full object-cover" />
      </div>
    )
  }

  const frame = aspectStyle(format.aspect)
  const label = format.kind ? KIND_LABEL[format.kind] : "Ad"
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-input bg-surface-panel", box)}
      data-creative-preview="none"
    >
      <div
        className="flex max-h-full max-w-full items-center justify-center rounded-input border border-border bg-muted"
        style={frame}
      >
        {size === "card" ? (
          <span className="flex flex-col items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <KindIcon kind={format.kind} />
            {label}
          </span>
        ) : (
          <KindIcon kind={format.kind} />
        )}
      </div>
    </div>
  )
}
