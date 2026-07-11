"use client"

import { useEffect, useRef, type ReactNode, type RefObject } from "react"
import {
  Bell,
  Heart,
  Home,
  Menu,
  MessageCircle,
  PlusSquare,
  Search,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { IgGradientRing } from "./shared"

/** Grey placeholder avatar — organic feed chrome only. */
function PlaceholderAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-7 w-7" : "h-9 w-9"
  return (
    <div
      className={cn("shrink-0 rounded-full bg-muted-foreground/25", sizeClass)}
      aria-hidden
    />
  )
}

function PlaceholderImageBlock({ className }: { className?: string }) {
  return <div className={cn("w-full bg-muted", className)} aria-hidden />
}

/** Scroll the ad into view once the feed mounts (ad starts mid-feed). */
function useScrollAdIntoView(adRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = adRef.current
    if (!node) return
    const id = window.requestAnimationFrame(() => {
      node.scrollIntoView({ block: "center", behavior: "auto" })
    })
    return () => window.cancelAnimationFrame(id)
  }, [adRef])
}

export function FacebookFeedShell({ children }: { children: ReactNode }) {
  const adRef = useRef<HTMLDivElement>(null)
  useScrollAdIntoView(adRef)

  return (
    <div className="mx-auto flex h-full max-h-[min(820px,100%)] w-full max-w-[500px] flex-col overflow-hidden rounded-frame border border-border bg-muted shadow-e1">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2.5">
        <div className="flex flex-1 items-center gap-2 rounded-pill bg-muted px-3 py-1.5 text-muted-foreground">
          <Search className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          <span className="text-xs">Search</span>
        </div>
        <button type="button" tabIndex={-1} className="rounded-full p-1.5 text-muted-foreground" aria-hidden>
          <Home className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <button type="button" tabIndex={-1} className="rounded-full p-1.5 text-muted-foreground" aria-hidden>
          <Users className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <button type="button" tabIndex={-1} className="rounded-full p-1.5 text-muted-foreground" aria-hidden>
          <Bell className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <button type="button" tabIndex={-1} className="rounded-full p-1.5 text-muted-foreground" aria-hidden>
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Organic text-only post above */}
        <article className="mb-2 border-b border-border bg-card px-4 py-3">
          <header className="mb-2 flex items-center gap-3">
            <PlaceholderAvatar />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">Neighbourhood update</p>
              <p className="text-xs text-muted-foreground">2h · Public</p>
            </div>
          </header>
          <p className="text-sm text-foreground">
            Looking forward to the weekend markets — anyone else heading down early?
          </p>
        </article>

        <div ref={adRef} className="mb-2 bg-card">
          {children}
        </div>

        {/* Organic post with image below */}
        <article className="border-b border-border bg-card">
          <header className="flex items-center gap-3 px-4 py-3">
            <PlaceholderAvatar />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">Local trails</p>
              <p className="text-xs text-muted-foreground">5h · Public</p>
            </div>
          </header>
          <p className="px-4 pb-3 text-sm text-foreground">
            Clear skies on the ridge this morning. Perfect for a short walk.
          </p>
          <PlaceholderImageBlock className="aspect-[16/10]" />
        </article>
      </div>
    </div>
  )
}

const STORY_LABELS = ["You", "Alex", "Sam", "Jordan", "Casey", "Riley"] as const

export function InstagramFeedShell({ children }: { children: ReactNode }) {
  const adRef = useRef<HTMLDivElement>(null)
  useScrollAdIntoView(adRef)

  return (
    <div className="mx-auto flex h-full max-h-[min(820px,100%)] w-full max-w-[420px] flex-col overflow-hidden rounded-frame border border-border bg-card shadow-e1">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <p className="text-base font-semibold tracking-tight text-foreground">Instagram</p>
        <div className="flex items-center gap-3 text-foreground">
          <PlusSquare className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          <Heart className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Stories rail */}
        <div className="flex gap-3 overflow-x-auto border-b border-border px-3 py-3">
          {STORY_LABELS.map((label, index) => (
            <div key={label} className="flex w-14 shrink-0 flex-col items-center gap-1">
              {index === 0 ? (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-border bg-muted">
                  <PlaceholderAvatar size="sm" />
                </div>
              ) : (
                <IgGradientRing>
                  <PlaceholderAvatar size="sm" />
                </IgGradientRing>
              )}
              <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Organic square post above */}
        <article className="border-b border-border">
          <header className="flex items-center gap-2.5 px-3 py-2.5">
            <IgGradientRing>
              <PlaceholderAvatar size="sm" />
            </IgGradientRing>
            <p className="truncate text-sm font-semibold lowercase text-foreground">weekend.notes</p>
          </header>
          <PlaceholderImageBlock className="aspect-square" />
          <div className="space-y-1 px-3 py-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold lowercase">weekend.notes</span>{" "}
              Soft light through the kitchen window.
            </p>
          </div>
        </article>

        <div ref={adRef}>{children}</div>

        {/* Partial post peeking below */}
        <article className="border-t border-border opacity-90" aria-hidden>
          <header className="flex items-center gap-2.5 px-3 py-2.5">
            <IgGradientRing>
              <PlaceholderAvatar size="sm" />
            </IgGradientRing>
            <p className="truncate text-sm font-semibold lowercase text-foreground">city.walks</p>
          </header>
          <PlaceholderImageBlock className="h-28" />
        </article>
      </div>
    </div>
  )
}

export function InstagramStoryShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex w-full max-w-[420px] items-stretch justify-center gap-0">
      {/* Adjacent story edge — left */}
      <div
        className="relative w-8 shrink-0 overflow-hidden rounded-l-frame bg-foreground/90 sm:w-12"
        aria-hidden
      >
        <div className="absolute inset-y-0 right-0 w-full bg-gradient-to-l from-foreground/80 to-muted/40" />
        <div className="absolute inset-y-1/3 left-1 flex h-1/3 w-1 items-center">
          <span className="h-8 w-1 rounded-pill bg-background/40" />
        </div>
      </div>

      <div className="relative z-10 min-w-0 flex-1">{children}</div>

      {/* Adjacent story edge — right */}
      <div
        className="relative w-8 shrink-0 overflow-hidden rounded-r-frame bg-foreground/90 sm:w-12"
        aria-hidden
      >
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-foreground/80 to-muted/40" />
        <div className="absolute inset-y-1/3 right-1 flex h-1/3 w-1 items-center justify-end">
          <span className="h-8 w-1 rounded-pill bg-background/40" />
        </div>
      </div>
    </div>
  )
}

export function TikTokFeedShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-full max-h-[min(780px,100%)] w-full max-w-[360px] flex-col overflow-hidden rounded-frame border border-border bg-foreground shadow-e2">
      <header className="relative z-30 flex shrink-0 items-center justify-center gap-5 px-4 pb-2 pt-3 text-sm font-semibold text-background/60">
        <span>Following</span>
        <span className="relative text-background">
          For You
          <span className="absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-pill bg-background" />
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
