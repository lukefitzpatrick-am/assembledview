"use client"

import { useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"

import {
  RSA_SERVE_DESCRIPTIONS,
  RSA_SERVE_HEADLINES,
  type SearchAdCopy,
  type SearchAsset,
  type SearchAssetPin,
  type SearchLimits,
} from "@/components/creative/searchads/types"
import { cn } from "@/lib/utils"

type Props = {
  copy: SearchAdCopy
  limits: SearchLimits
}

const HEADLINE_SLOT_PINS: SearchAssetPin[] = ["H1", "H2", "H3"]
const DESCRIPTION_SLOT_PINS: SearchAssetPin[] = ["D1", "D2"]

function hostnameFromFinalUrl(finalUrl: string): string {
  const raw = finalUrl.trim()
  if (!raw) return "example.com"
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0] || "example.com"
  }
}

function buildDisplayLine(copy: SearchAdCopy): string {
  const parts = [hostnameFromFinalUrl(copy.finalUrl)]
  for (const path of [copy.path1, copy.path2]) {
    const segment = path.trim().replace(/^\/+|\/+$/g, "")
    if (segment) parts.push(segment)
  }
  return parts.join("/")
}

/**
 * Fill serving slots: pinned assets claim their H1/H2/H3 (or D1/D2) slot;
 * remaining slots rotate through the unpinned pool via `rotation`.
 */
function selectServedTexts(
  assets: SearchAsset[],
  slotPins: SearchAssetPin[],
  slotCount: number,
  rotation: number,
): string[] {
  const slots: Array<string | null> = Array.from({ length: slotCount }, () => null)
  const used = new Set<number>()
  const pinSet = new Set(
    slotPins.filter((pin): pin is Exclude<SearchAssetPin, null> => pin != null),
  )

  for (let i = 0; i < slotCount; i += 1) {
    const pin = slotPins[i]
    if (!pin) continue
    const idx = assets.findIndex(
      (asset, j) => !used.has(j) && asset.pinned === pin && asset.text.trim(),
    )
    if (idx >= 0) {
      slots[i] = assets[idx].text.trim()
      used.add(idx)
    }
  }

  const pool = assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset, index }) => {
      if (used.has(index) || !asset.text.trim()) return false
      const pin = asset.pinned ?? null
      if (pin && pinSet.has(pin)) return false
      return true
    })
    .map(({ asset }) => asset.text.trim())

  if (pool.length > 0) {
    const offset = ((rotation % pool.length) + pool.length) % pool.length
    const rotated = [...pool.slice(offset), ...pool.slice(0, offset)]
    let cursor = 0
    for (let i = 0; i < slotCount; i += 1) {
      if (slots[i] != null) continue
      if (cursor >= rotated.length) break
      slots[i] = rotated[cursor]
      cursor += 1
    }
  }

  return slots.filter((text): text is string => Boolean(text))
}

function pickRotatedAsset(
  assets: SearchAsset[] | undefined,
  rotation: number,
): string {
  const pool = (assets ?? []).map((a) => a.text.trim()).filter(Boolean)
  if (pool.length === 0) return ""
  const offset = ((rotation % pool.length) + pool.length) % pool.length
  return pool[offset] ?? ""
}

function EmptySerpSkeleton() {
  return (
    <div
      className="space-y-2.5 rounded-card border border-border bg-card p-4"
      aria-label="Empty search ad preview"
    >
      <div className="h-3 w-16 animate-pulse rounded-input bg-muted" />
      <div className="h-3 w-48 animate-pulse rounded-input bg-muted" />
      <div className="h-5 w-full max-w-md animate-pulse rounded-input bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded-input bg-muted" />
        <div className="h-3 w-72 max-w-full animate-pulse rounded-input bg-muted" />
      </div>
      <p className="pt-1 text-xs text-muted-foreground">
        Add headlines to preview the SERP combination.
      </p>
    </div>
  )
}

function ShuffleButton({
  onClick,
  label = "Shuffle combination",
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-input border border-border bg-card",
        "px-2.5 py-1 text-xs font-medium text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <RefreshCw className="h-3 w-3" strokeWidth={1.8} aria-hidden />
      {label}
    </button>
  )
}

function RsaSerpAd({ copy }: { copy: SearchAdCopy }) {
  const [rotation, setRotation] = useState(0)
  const hasHeadlines = copy.headlines.some((asset) => asset.text.trim())

  const headlineTexts = useMemo(
    () =>
      selectServedTexts(
        copy.headlines,
        HEADLINE_SLOT_PINS,
        RSA_SERVE_HEADLINES,
        rotation,
      ),
    [copy.headlines, rotation],
  )

  const descriptionTexts = useMemo(
    () =>
      selectServedTexts(
        copy.descriptions,
        DESCRIPTION_SLOT_PINS,
        RSA_SERVE_DESCRIPTIONS,
        rotation,
      ),
    [copy.descriptions, rotation],
  )

  const sitelinks = (copy.sitelinks ?? []).filter((link) => link.text.trim())
  const callouts = (copy.callouts ?? []).map((c) => c.trim()).filter(Boolean)

  if (!hasHeadlines) return <EmptySerpSkeleton />

  const title = headlineTexts.join("  |  ")
  const description = descriptionTexts.join(" ")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Sponsored
        </p>
        <ShuffleButton onClick={() => setRotation((n) => n + 1)} />
      </div>

      <article className="space-y-1">
        <p className="truncate text-sm text-muted-foreground">
          {buildDisplayLine(copy)}
        </p>
        <h3 className="text-xl font-medium leading-snug text-status-on-track-fg">
          {title || "Headline preview"}
        </h3>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}

        {sitelinks.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5">
            {sitelinks.map((link, index) => (
              <li key={`${link.text}-${index}`}>
                <span
                  className="cursor-default text-sm text-status-on-track-fg"
                  title={link.url || undefined}
                >
                  {link.text}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {callouts.length > 0 ? (
          <p className="pt-1 text-xs text-muted-foreground">
            {callouts.join(" · ")}
          </p>
        ) : null}
      </article>
    </div>
  )
}

function PmaxPreviewCard({ copy }: { copy: SearchAdCopy }) {
  const [rotation, setRotation] = useState(0)

  const brand =
    copy.businessName?.trim()
    || hostnameFromFinalUrl(copy.finalUrl).replace(/\.[a-z]+$/i, "")
    || "Brand"

  const headline = useMemo(
    () => pickRotatedAsset(copy.headlines, rotation),
    [copy.headlines, rotation],
  )
  const longHeadline = useMemo(
    () => pickRotatedAsset(copy.longHeadlines, rotation),
    [copy.longHeadlines, rotation],
  )
  const description = useMemo(
    () => pickRotatedAsset(copy.descriptions, rotation),
    [copy.descriptions, rotation],
  )

  const empty =
    !headline && !longHeadline && !description && !copy.businessName?.trim()

  if (empty) return <EmptySerpSkeleton />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Performance Max — representative preview (not a literal SERP)
        </p>
        <ShuffleButton onClick={() => setRotation((n) => n + 1)} />
      </div>

      <article className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-muted text-xs font-semibold text-muted-foreground"
            aria-hidden
          >
            {brand.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{brand}</p>
            <p className="truncate text-xs text-muted-foreground">
              {buildDisplayLine(copy)}
            </p>
          </div>
        </div>

        <div className="space-y-2 px-4 py-3">
          {headline ? (
            <p className="text-base font-medium text-status-on-track-fg">{headline}</p>
          ) : null}
          {longHeadline ? (
            <p className="text-sm font-medium text-foreground">{longHeadline}</p>
          ) : null}
          {description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </article>
    </div>
  )
}

export function GoogleSerpAd({ copy, limits: _limits }: Props) {
  if (copy.format === "pmax") {
    return <PmaxPreviewCard copy={copy} />
  }
  return <RsaSerpAd copy={copy} />
}
