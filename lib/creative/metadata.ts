export type AssetDimensions = {
  width_px: number
  height_px: number
  duration_seconds: number
}

const ZERO_DIMENSIONS: AssetDimensions = {
  width_px: 0,
  height_px: 0,
  duration_seconds: 0,
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/")
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/")
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith("audio/")
}

function loadImageDimensions(file: File): Promise<AssetDimensions> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({
        width_px: img.naturalWidth || 0,
        height_px: img.naturalHeight || 0,
        duration_seconds: 0,
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(ZERO_DIMENSIONS)
    }
    img.src = url
  })
}

function loadMediaDimensions(
  file: File,
  kind: "video" | "audio",
): Promise<AssetDimensions> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(kind)
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      const duration = Number.isFinite(el.duration) ? el.duration : 0
      if (kind === "video") {
        const video = el as HTMLVideoElement
        resolve({
          width_px: video.videoWidth || 0,
          height_px: video.videoHeight || 0,
          duration_seconds: duration,
        })
      } else {
        resolve({
          width_px: 0,
          height_px: 0,
          duration_seconds: duration,
        })
      }
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(ZERO_DIMENSIONS)
    }
    el.src = url
  })
}

export async function extractAssetDimensions(file: File): Promise<AssetDimensions> {
  const mime = file.type || "application/octet-stream"
  if (isImageMime(mime)) return loadImageDimensions(file)
  if (isVideoMime(mime)) return loadMediaDimensions(file, "video")
  if (isAudioMime(mime)) return loadMediaDimensions(file, "audio")
  return ZERO_DIMENSIONS
}

export const ACCEPTED_CREATIVE_MIME_PREFIXES = ["image/", "video/", "audio/"] as const

export const ACCEPTED_CREATIVE_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
])

export function isAcceptedCreativeFile(file: File): boolean {
  const mime = file.type || ""
  if (ACCEPTED_CREATIVE_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return true
  }
  if (ACCEPTED_CREATIVE_MIME_TYPES.has(mime)) return true
  const lower = file.name.toLowerCase()
  return lower.endsWith(".pdf") || lower.endsWith(".zip")
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const precision = unitIndex === 0 ? 0 : size < 10 ? 1 : 0
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

export function formatDimensions(asset: {
  width_px: number
  height_px: number
  duration_seconds: number
  mime_type: string
}): string {
  const mime = asset.mime_type || ""
  const parts: string[] = []

  if ((mime.startsWith("image/") || mime.startsWith("video/")) && asset.width_px > 0 && asset.height_px > 0) {
    parts.push(`${asset.width_px}×${asset.height_px}`)
  }
  if ((mime.startsWith("audio/") || mime.startsWith("video/")) && asset.duration_seconds > 0) {
    parts.push(formatDuration(asset.duration_seconds))
  }

  return parts.length > 0 ? parts.join(" · ") : "—"
}
