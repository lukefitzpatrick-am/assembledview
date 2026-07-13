"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { CreativeAsset } from "@/lib/creative/types"
import { cn } from "@/lib/utils"
import { useMediaObjectUrl } from "./useMediaObjectUrl"

export function isImage(mime: string) {
  return mime.startsWith("image/")
}

export function isVideo(mime: string) {
  return mime.startsWith("video/")
}

export function isHtml5Zip(mime: string) {
  return mime === "application/zip"
}

export function mediaSrc(asset: CreativeAsset) {
  return `/api/creative-assets/${asset.id}/download`
}

export function brandInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "B"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
}

const AVATAR_TONES = [
  "bg-primary text-primary-foreground",
  "bg-channel-social text-primary-foreground",
  "bg-channel-tv text-primary-foreground",
  "bg-channel-bvod text-primary-foreground",
  "bg-channel-search text-primary-foreground",
  "bg-channel-progDisplay text-foreground",
] as const

function avatarTone(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length
  }
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0]
}

export function BrandAvatar({
  name,
  size = "md",
  className,
  metaPageId,
}: {
  name: string
  size?: "sm" | "md" | "lg"
  className?: string
  /** Meta Page ID — public Graph picture URL when set; initials on missing/broken. */
  metaPageId?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const sizeClass =
    size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs"
  const pageId = metaPageId?.trim() ?? ""
  const showImage = pageId.length > 0 && !imgFailed

  useEffect(() => {
    setImgFailed(false)
  }, [pageId])

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public Graph CDN avatar; no next/image remote config needed
      <img
        src={`https://graph.facebook.com/${encodeURIComponent(pageId)}/picture?type=large`}
        alt=""
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full object-cover", sizeClass, className)}
        onError={() => setImgFailed(true)}
        aria-hidden
      />
    )
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizeClass,
        avatarTone(name || "Brand"),
        className,
      )}
      aria-hidden
    >
      {brandInitials(name || "Brand")}
    </div>
  )
}

export function IgGradientRing({ children }: { children: ReactNode }) {
  return (
    <div className="social-ig-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-[2px]">
      <div className="rounded-full bg-card p-[2px]">{children}</div>
    </div>
  )
}

type MediaFit = "cover" | "contain"

function RawMedia({
  asset,
  fit,
  className,
  objectUrl,
  objectLoading,
}: {
  asset: CreativeAsset
  fit: MediaFit
  className?: string
  /** Shared blob URL when parent already loaded the video. */
  objectUrl?: string | null
  objectLoading?: boolean
}) {
  const objectClass = fit === "contain" ? "object-contain" : "object-cover"
  const fetched = useMediaObjectUrl(
    isVideo(asset.mime_type) && objectUrl === undefined ? asset : null,
  )
  const videoSrc = objectUrl !== undefined ? objectUrl : fetched.url
  const videoLoading =
    objectUrl !== undefined ? Boolean(objectLoading) : fetched.loading || !fetched.url

  if (isVideo(asset.mime_type)) {
    if (videoLoading || !videoSrc) {
      return (
        <Skeleton
          className={cn("h-full w-full rounded-none", className)}
          aria-label={fetched.error ?? "Loading video preview"}
        />
      )
    }
    return (
      <video
        className={cn("h-full w-full", objectClass, className)}
        src={videoSrc}
        muted
        autoPlay
        loop
        playsInline
      />
    )
  }

  if (isImage(asset.mime_type)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- trusted campaign asset via authenticated download route
      <img
        className={cn("h-full w-full", objectClass, className)}
        src={`${mediaSrc(asset)}?inline=1`}
        alt={asset.asset_name}
      />
    )
  }

  return null
}

export function Html5Notice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted px-6 py-10 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      HTML5 creatives preview in webpage templates
    </div>
  )
}

function UnsupportedNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted px-6 py-10 text-sm text-muted-foreground",
        className,
      )}
    >
      This asset type can’t be previewed in a social frame.
    </div>
  )
}

/** Feed media — cover-fit inside a fixed aspect box. */
export function FeedMedia({
  asset,
  className,
}: {
  asset: CreativeAsset
  className?: string
}) {
  if (isHtml5Zip(asset.mime_type)) {
    return <Html5Notice className={className} />
  }
  if (!isImage(asset.mime_type) && !isVideo(asset.mime_type)) {
    return <UnsupportedNotice className={className} />
  }
  return <RawMedia asset={asset} fit="cover" className={className} />
}

/**
 * Stories / TikTok: fill 9:16 with letterboxed media over a blurred copy of itself.
 */
export function StoryMedia({
  asset,
  className,
}: {
  asset: CreativeAsset
  className?: string
}) {
  const sharedVideo = useMediaObjectUrl(isVideo(asset.mime_type) ? asset : null)

  if (isHtml5Zip(asset.mime_type)) {
    return <Html5Notice className={cn("absolute inset-0", className)} />
  }
  if (!isImage(asset.mime_type) && !isVideo(asset.mime_type)) {
    return <UnsupportedNotice className={cn("absolute inset-0", className)} />
  }

  const videoProps = isVideo(asset.mime_type)
    ? {
        objectUrl: sharedVideo.url,
        objectLoading: sharedVideo.loading || !sharedVideo.url,
      }
    : {}

  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-foreground", className)}>
      <div className="absolute inset-0 scale-110 opacity-70 blur-2xl" aria-hidden>
        <RawMedia asset={asset} fit="cover" {...videoProps} />
      </div>
      <div className="relative z-10 flex h-full w-full items-center justify-center">
        <RawMedia asset={asset} fit="contain" {...videoProps} />
      </div>
    </div>
  )
}

export function truncateWithMore(text: string, max: number, moreLabel: string) {
  if (text.length <= max) {
    return { visible: text, truncated: false as const, moreLabel }
  }
  return {
    visible: text.slice(0, max).trimEnd(),
    truncated: true as const,
    moreLabel,
  }
}

export function formatDisplayLink(link: string) {
  return link
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase()
}

export function DestinationTooltip({
  destinationUrl,
  children,
}: {
  destinationUrl: string
  children: ReactNode
}) {
  const url = destinationUrl.trim()
  if (!url) return <>{children}</>

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs break-all">
          {url}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Inert CTA — never navigates. */
export function InertCta({
  children,
  className,
  destinationUrl,
}: {
  children: ReactNode
  className?: string
  destinationUrl?: string
}) {
  const button = (
    <button
      type="button"
      className={cn("cursor-default", className)}
      onClick={(event) => event.preventDefault()}
      tabIndex={-1}
    >
      {children}
    </button>
  )

  if (!destinationUrl?.trim()) return button
  return <DestinationTooltip destinationUrl={destinationUrl}>{button}</DestinationTooltip>
}
