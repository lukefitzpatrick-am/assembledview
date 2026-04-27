"use client"

import Link from "next/link"
import React, { useEffect, useMemo, useState, type ReactNode } from "react"
import { Activity, ChevronDown, Facebook, Gauge, RefreshCw, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatCurrencyCompact } from "@/lib/format/currency"

type Platform = "social" | "search" | "programmatic"
type PlatformFilter = "all" | "meta" | "tiktok" | "search" | "programmatic"

export interface DeliverySectionProps {
  platformSlots?: Partial<Record<Platform, ReactNode>>
  children?: ReactNode
  summary: {
    totalSpend: number
    totalDeliverables: number
    avgPacingPct: number
    lineItemCount: number
  }
  lastUpdated?: Date
  onRefresh: () => void
  isLoading?: boolean
  error?: Error | null
  platforms?: Platform[]
  /** Passed into platform slot roots for chart / progress accents. */
  brandColour?: string
}

const STORAGE_KEY = "dashboard.delivery.platform-expansion.v1"

function platformLabel(platform: Platform): string {
  if (platform === "social") return "Social"
  if (platform === "search") return "Search"
  return "Programmatic"
}

function platformIcon(platform: Platform) {
  if (platform === "social") return Facebook
  if (platform === "search") return Search
  return Gauge
}

function formatDeliverables(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value || 0)
}

function formatLastUpdated(value?: Date): string {
  if (!value) return "Not yet synced"
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function injectBrandColour(node: ReactNode, brandColour?: string): ReactNode {
  if (!brandColour || !React.isValidElement(node)) return node
  return React.cloneElement(node as React.ReactElement<{ brandColour?: string }>, { brandColour })
}

type GroupedEntry = { platform: Platform; child: ReactNode }

export default function DeliverySection({
  platformSlots,
  children,
  summary,
  lastUpdated,
  onRefresh,
  isLoading = false,
  error = null,
  platforms = ["social", "search", "programmatic"],
  brandColour,
}: DeliverySectionProps) {
  const childArray = useMemo(
    () => (Array.isArray(children) ? children : children != null ? [children] : []).filter(Boolean),
    [children],
  )
  const [expandedByPlatform, setExpandedByPlatform] = useState<Record<Platform, boolean>>({
    social: true,
    search: true,
    programmatic: true,
  })
  const [filter, setFilter] = useState<PlatformFilter>("all")
  const [cachedGroups, setCachedGroups] = useState<GroupedEntry[] | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<Record<Platform, boolean>>
      setExpandedByPlatform((prev) => ({
        social: parsed.social ?? prev.social,
        search: parsed.search ?? prev.search,
        programmatic: parsed.programmatic ?? prev.programmatic,
      }))
    } catch {
      // Ignore malformed local preference.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expandedByPlatform))
  }, [expandedByPlatform])

  const groupedChildren = useMemo((): GroupedEntry[] => {
    if (platformSlots) {
      return platforms
        .map((platform) => ({
          platform,
          child: platformSlots[platform] ?? null,
        }))
        .filter((entry) => entry.child != null && entry.child !== false)
    }
    return platforms
      .map((platform, idx) => ({
        platform,
        child: childArray[idx] ?? null,
      }))
      .filter((entry) => entry.child != null && entry.child !== false)
  }, [platformSlots, platforms, childArray])

  useEffect(() => {
    if (!error && !isLoading && groupedChildren.length > 0) {
      setCachedGroups(groupedChildren)
    }
  }, [groupedChildren, error, isLoading])

  const visibleGroups = useMemo(() => {
    if (filter === "all") return groupedChildren
    if (filter === "search") return groupedChildren.filter((g) => g.platform === "search")
    if (filter === "programmatic") return groupedChildren.filter((g) => g.platform === "programmatic")
    return groupedChildren.filter((g) => g.platform === "social")
  }, [filter, groupedChildren])

  const isEmpty = !isLoading && !error && groupedChildren.length === 0

  const filterOptions: PlatformFilter[] = ["all", "meta", "tiktok", "search", "programmatic"]

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Delivery</h3>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
            Last updated: {formatLastUpdated(lastUpdated)}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh delivery data"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </header>

      <p className="mt-3 text-sm text-muted-foreground">Real-time performance tracking for active line items</p>

      <div
        className="mt-4 inline-flex flex-wrap gap-1 rounded-full border border-border/60 bg-muted/20 p-1"
        role="tablist"
        aria-label="Platform filter"
      >
        {filterOptions.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={filter === option}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              filter === option
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-14 w-36 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <p className="text-sm text-muted-foreground">Fetching latest delivery data...</p>
        </div>
      ) : null}

      {!isLoading ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["Total spend", formatCurrencyCompact(summary.totalSpend)],
              ["Total deliverables", formatDeliverables(summary.totalDeliverables)],
              ["Average delivery", `${summary.avgPacingPct.toFixed(1)}%`],
              ["Line items tracked", String(summary.lineItemCount)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="mt-6 rounded-2xl border border-rose-300/40 bg-rose-500/5 p-4">
          <p className="text-sm font-medium text-rose-700">Unable to load live delivery data.</p>
          <p className="mt-1 text-sm text-rose-700/80">{error.message || "Unknown delivery error"}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button type="button" size="sm" onClick={onRefresh}>
              Retry
            </Button>
            {cachedGroups?.length ? (
              <span className="text-xs text-muted-foreground">Showing cached data below</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
          <div className="rounded-full bg-muted p-3">
            <Gauge className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No active line items with delivery data</p>
          <p className="text-xs text-muted-foreground">Check campaign date range and active platform configuration.</p>
          <Link href="/learning" className="text-sm text-primary hover:underline">
            Learn how to set up delivery
          </Link>
        </div>
      ) : null}

      {!isLoading && !isEmpty ? (
        <div className="mt-6 space-y-4">
          {(error && cachedGroups?.length ? cachedGroups : visibleGroups)
            .filter((entry) => entry.child)
            .map(({ platform, child }, idx) => {
              const Icon = platformIcon(platform)
              const expanded = expandedByPlatform[platform]
              return (
                <div
                  key={`${platform}-${idx}`}
                  className="overflow-hidden rounded-xl border border-border/60 bg-card"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20"
                    onClick={() =>
                      setExpandedByPlatform((prev) => ({
                        ...prev,
                        [platform]: !prev[platform],
                      }))
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">{platformLabel(platform)}</span>
                    </div>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded ? "rotate-0" : "-rotate-90")}
                    />
                  </button>
                  {expanded ? (
                    <div className="border-t border-border/50 p-4 pt-4">
                      <div
                        className="campaign-section-enter"
                        style={{ animationDelay: `${idx * 80}ms` }}
                      >
                        {injectBrandColour(child, brandColour)}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
        </div>
      ) : null}
    </section>
  )
}
