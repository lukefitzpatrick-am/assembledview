"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getMediaTypeThemeHex,
  type MediaTypeThemeKey,
} from "@/lib/mediaplan/mediaTypeAccents"

const MEDIA_SECTION_PREFIX = "media-section-"

/** Form field names (`mp_*`) → keys in `mediaTypeTheme.colors` (same as dashboards / KPIs). */
const FORM_FIELD_TO_THEME_KEY: Record<string, MediaTypeThemeKey> = {
  mp_television: "television",
  mp_radio: "radio",
  mp_newspaper: "newspaper",
  mp_magazines: "magazines",
  mp_ooh: "ooh",
  mp_cinema: "cinema",
  mp_digidisplay: "digidisplay",
  mp_digiaudio: "digiaudio",
  mp_digivideo: "digivideo",
  mp_bvod: "bvod",
  mp_integration: "integration",
  mp_search: "search",
  mp_socialmedia: "socialmedia",
  mp_progdisplay: "progdisplay",
  mp_progvideo: "progvideo",
  mp_progbvod: "progbvod",
  mp_progaudio: "progaudio",
  mp_progooh: "progooh",
  mp_influencers: "influencers",
  mp_production: "production",
}

function accentHexForSectionId(sectionId: string): string | undefined {
  if (!sectionId.startsWith(MEDIA_SECTION_PREFIX)) return undefined
  const field = sectionId.slice(MEDIA_SECTION_PREFIX.length)
  const key = FORM_FIELD_TO_THEME_KEY[field]
  if (!key) return undefined
  return getMediaTypeThemeHex(key)
}

export type FloatingSectionNavSection = { id: string; label: string }

export type FloatingSectionNavProps = {
  sections: FloatingSectionNavSection[]
  offsetTop?: number
  storageKey?: string
  className?: string
}

const DEFAULT_OFFSET_TOP = 96
const DEFAULT_STORAGE_KEY = "mediaplan-section-nav-collapsed"

const NAV_WIDTH_PX = 160

function dragPositionStorageKey(storageKey: string) {
  return `${storageKey}:drag-position`
}

function readCollapsedFromStorage(key: string): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(key) === "true"
}

function writeCollapsedToStorage(key: string, collapsed: boolean) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, String(collapsed))
}

function readPositionFromStorage(key: string): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 }
  try {
    const raw = window.localStorage.getItem(dragPositionStorageKey(key))
    if (!raw) return { x: 0, y: 0 }
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      "x" in parsed &&
      "y" in parsed &&
      typeof (parsed as { x: unknown }).x === "number" &&
      typeof (parsed as { y: unknown }).y === "number"
    ) {
      return { x: (parsed as { x: number }).x, y: (parsed as { y: number }).y }
    }
  } catch {
    // ignore
  }
  return { x: 0, y: 0 }
}

function writePositionToStorage(storageKey: string, pos: { x: number; y: number }) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(dragPositionStorageKey(storageKey), JSON.stringify(pos))
  } catch {
    // ignore quota / private mode
  }
}

export default function FloatingSectionNav({
  sections,
  offsetTop = DEFAULT_OFFSET_TOP,
  storageKey = DEFAULT_STORAGE_KEY,
  className,
}: FloatingSectionNavProps) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const [activeSectionId, setActiveSectionId] = React.useState<string | null>(null)

  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [dragState, setDragState] = React.useState<{ offsetX: number; offsetY: number } | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const dragMovedRef = React.useRef(false)
  const positionRef = React.useRef(position)
  positionRef.current = position

  const intersectionStateRef = React.useRef(
    new Map<string, { intersecting: boolean; ratio: number }>(),
  )

  React.useEffect(() => {
    setCollapsed(readCollapsedFromStorage(storageKey))
    setPosition(readPositionFromStorage(storageKey))
    setHydrated(true)
  }, [storageKey])

  React.useEffect(() => {
    if (sections.length === 0) return

    const intersectionMap = intersectionStateRef.current
    intersectionMap.clear()

    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    const allowedIds = new Set(sections.map((s) => s.id))

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id
          if (!allowedIds.has(id)) continue
          intersectionMap.set(id, {
            intersecting: entry.isIntersecting,
            ratio: entry.intersectionRatio,
          })
        }

        let best: { id: string; ratio: number } | null = null
        for (const [id, v] of intersectionMap) {
          if (!allowedIds.has(id)) continue
          if (v.intersecting && (best === null || v.ratio > best.ratio)) {
            best = { id, ratio: v.ratio }
          }
        }

        if (best) {
          setActiveSectionId(best.id)
        }
      },
      {
        root: null,
        rootMargin: "-15% 0px -65% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )

    for (const el of elements) {
      observer.observe(el)
    }

    return () => {
      observer.disconnect()
      intersectionMap.clear()
    }
  }, [sections])

  const startDrag = React.useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      dragMovedRef.current = false
      setDragState({
        offsetX: event.clientX - positionRef.current.x,
        offsetY: event.clientY - positionRef.current.y,
      })
    },
    [],
  )

  React.useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (event: MouseEvent) => {
      dragMovedRef.current = true
      setIsDragging(true)
      setPosition({
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      })
    }

    const handleMouseUp = () => {
      setDragState(null)
      writePositionToStorage(storageKey, positionRef.current)
      requestAnimationFrame(() => setIsDragging(false))
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [dragState, storageKey])

  const handleHeaderClick = React.useCallback(() => {
    if (dragMovedRef.current || isDragging) {
      dragMovedRef.current = false
      return
    }
    setCollapsed((prev) => {
      const next = !prev
      writeCollapsedToStorage(storageKey, next)
      return next
    })
  }, [isDragging, storageKey])

  const scrollToSection = (id: string) => {
    setActiveSectionId(id)
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - offsetTop
    window.scrollTo({ top, behavior: "smooth" })
  }

  if (sections.length === 0) {
    return null
  }

  const showCollapsed = hydrated ? collapsed : false

  return (
    <nav
      aria-label="Jump to media section"
      className={cn(
        "pointer-events-auto w-[160px] max-w-[160px] overflow-hidden rounded-md border-[0.5px] border-border/60 bg-card opacity-100 shadow-md",
        className,
      )}
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 40,
        width: NAV_WIDTH_PX,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    >
      <button
        type="button"
        aria-expanded={!showCollapsed}
        aria-controls="floating-section-nav-list"
        onMouseDown={startDrag}
        onClick={handleHeaderClick}
        title="Drag to move · Click to expand or collapse"
        className={cn(
          "flex w-full cursor-grab select-none items-center justify-between gap-2 border-b border-black/10 bg-lime px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-darkGrey transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-darkGrey focus-visible:ring-offset-2 focus-visible:ring-offset-lime active:cursor-grabbing",
          isDragging && "cursor-grabbing",
        )}
      >
        <span>Jump to section</span>
        {showCollapsed ? (
          <ChevronUp className="size-4 shrink-0 text-darkGrey/80" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-darkGrey/80" aria-hidden />
        )}
      </button>

      <div
        id="floating-section-nav-list"
        hidden={showCollapsed}
        className="flex max-h-[280px] flex-col gap-px overflow-y-auto p-1.5"
      >
        {sections.map((section) => {
          const isActive = activeSectionId === section.id
          const accentHex = accentHexForSectionId(section.id)
          const accentStyle = accentHex
            ? ({ ["--media-accent" as string]: accentHex } as React.CSSProperties)
            : undefined
          return (
            <Button
              key={section.id}
              type="button"
              variant="ghost"
              size="sm"
              aria-current={isActive ? "location" : undefined}
              onClick={() => scrollToSection(section.id)}
              style={accentStyle}
              className={cn(
                "h-auto w-full justify-start rounded-sm border-l-2 border-l-transparent px-2.5 py-[5px] text-xs font-normal leading-snug text-muted-foreground",
                "hover:bg-muted",
                accentHex
                  ? "hover:text-[color:var(--media-accent)]"
                  : "hover:text-foreground",
                isActive &&
                  accentHex &&
                  "rounded-l-none rounded-r-sm border-l-[color:var(--media-accent)] bg-muted font-medium text-[color:var(--media-accent)] hover:bg-muted hover:text-[color:var(--media-accent)]",
                isActive &&
                  !accentHex &&
                  "rounded-l-none rounded-r-sm border-l-foreground bg-muted font-medium text-foreground hover:bg-muted",
              )}
            >
              {section.label}
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
