"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"

export interface LazyMountWhenVisibleProps {
  /** Human-readable label used for the loading placeholder (e.g. "Television"). */
  label: string
  children: ReactNode
  /**
   * IntersectionObserver rootMargin. Defaults to a generous vertical overscan so
   * near-viewport sections (and the totals/billing callbacks their containers fire
   * on mount) preload slightly ahead of the user scrolling into view.
   */
  rootMargin?: string
  /** Custom placeholder to render while the section is not yet mounted. */
  placeholder?: ReactNode
}

interface Rect {
  top: number
  bottom: number
}

/**
 * Pure helper: does a rect (already expanded conceptually by `marginPx`) overlap the
 * viewport? Exported so it can be unit tested without a DOM/IntersectionObserver.
 */
export function shouldMountFromRect(rect: Rect, viewportHeight: number, marginPx: number): boolean {
  return rect.bottom >= -marginPx && rect.top <= viewportHeight + marginPx
}

function parseRootMarginPx(rootMargin: string): number {
  const match = /^(-?\d+(?:\.\d+)?)px/.exec(rootMargin.trim())
  return match ? Number.parseFloat(match[1]) : 0
}

/**
 * Defers mounting `children` until the wrapper scrolls into (or near) the viewport.
 * Once mounted, `children` stay mounted forever — this is intentional so form state,
 * grid data, and callback wiring inside heavy media containers are never lost.
 *
 * Used on the MBA edit page so large multi-channel plans don't mount every channel's
 * grid/form on initial load (UX-6/21 loading-state scaffolding is reused for the
 * "not yet visible" placeholder).
 */
export function LazyMountWhenVisible({ label, children, rootMargin = "400px 0px", placeholder }: LazyMountWhenVisibleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useLayoutEffect(() => {
    if (mounted) return

    const node = containerRef.current
    if (!node) return

    if (typeof IntersectionObserver === "undefined") {
      setMounted(true)
      return
    }

    const marginPx = parseRootMarginPx(rootMargin)
    const rect = node.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight

    if (shouldMountFromRect(rect, viewportHeight, marginPx)) {
      setMounted(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [mounted, rootMargin])

  return <div ref={containerRef}>{mounted ? children : placeholder ?? <MediaContainerLoadState loading label={label} />}</div>
}
