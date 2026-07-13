"use client"

import { useEffect, useState } from "react"

import type { CreativeAsset } from "@/lib/creative/types"

type MediaObjectUrlState = {
  url: string | null
  loading: boolean
  error: string | null
}

/**
 * Fetch an authenticated creative download into a blob URL so <video> can play
 * non-faststart MP4s (moov at end) without relying on HTTP Range on the route.
 */
export function useMediaObjectUrl(asset: CreativeAsset | null): MediaObjectUrlState {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!asset) {
      setUrl(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      setLoading(true)
      setError(null)
      setUrl(null)

      try {
        const response = await fetch(
          `/api/creative-assets/${asset!.id}/download?inline=1`,
          { credentials: "include" },
        )
        if (!response.ok) throw new Error("download_failed")
        const blob = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        if (!cancelled) {
          setError("Couldn't load media preview.")
          setUrl(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset?.id])

  return { url, loading, error }
}
