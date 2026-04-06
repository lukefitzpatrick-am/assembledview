"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { Copy, Download, Eye, MoreHorizontal, Pencil } from "lucide-react"
import type { CSSProperties } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { MediaChannelTag, mediaChannelTagRowClassName } from "@/components/dashboard/MediaChannelTag"
import { cn } from "@/lib/utils"

export interface CampaignCardCompactProps {
  id: string
  name: string
  mbaNumber: string
  status: "live" | "planned" | "completed" | "paused"
  mediaTypes: string[]
  spentAmount: number
  totalBudget: number
  /** Campaign dashboard (read) URL, e.g. `/dashboard/{slug}/{mbaNumber}` */
  href: string
  /** Mediaplans editor URL when `canEdit` is true */
  editHref?: string
  /** When true, show Edit in the toolbar and menu (typically agency / admin hub). */
  canEdit?: boolean
  /** When false, hide the header pencil; edit stays under ⋮ only (e.g. client hub). Default true. */
  showInlineEditButton?: boolean
  /** Dropdown label for the dashboard link. */
  viewMenuLabel?: string
  /** Full `aria-label` for the card-sized dashboard link (defaults to “Open campaign {name}”). */
  viewLinkAriaLabel?: string
  brandColour?: string
}

type BrandStyle = CSSProperties & {
  "--brand-color"?: string
}

type StatusTone = {
  badge: string
  label: string
}

const statusMap: Record<CampaignCardCompactProps["status"], StatusTone> = {
  live: {
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    label: "Live",
  },
  planned: {
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    label: "Planned",
  },
  completed: {
    badge: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    label: "Completed",
  },
  paused: {
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    label: "Paused",
  },
}

function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""

  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

function getProgressTone(percent: number): string {
  if (percent < 25) return "bg-rose-500"
  if (percent < 75) return "bg-blue-500"
  return "bg-emerald-500"
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function buildDownloadSummaryHref(viewHref: string): string {
  return viewHref.includes("?") ? `${viewHref}&download=summary` : `${viewHref}?download=summary`
}

export function CampaignCardCompact({
  id,
  name,
  mbaNumber,
  status,
  mediaTypes,
  spentAmount,
  totalBudget,
  href: viewHref,
  editHref,
  canEdit = false,
  showInlineEditButton = true,
  viewMenuLabel = "View campaign",
  viewLinkAriaLabel,
  brandColour,
}: CampaignCardCompactProps) {
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()
  const progressPct = totalBudget > 0 ? clamp((spentAmount / totalBudget) * 100, 0, 100) : 0
  const statusTone = statusMap[status]
  const visibleTags = mediaTypes.slice(0, 3)
  const hiddenTagCount = Math.max(0, mediaTypes.length - visibleTags.length)
  const showEdit = Boolean(canEdit && editHref)
  const showPencil = showEdit && showInlineEditButton
  const downloadHref = buildDownloadSummaryHref(viewHref)

  const copyMbaNumber = async () => {
    try {
      await navigator.clipboard.writeText(mbaNumber)
      toast({ title: "Copied", description: "MBA number copied to clipboard." })
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard.",
        variant: "destructive",
      })
    }
  }

  return (
    <div
      className="group relative rounded-xl"
      data-campaign-id={id}
      style={brandColour ? ({ "--brand-color": brandColour } as BrandStyle) : undefined}
    >
      <Link
        href={viewHref}
        aria-label={viewLinkAriaLabel ?? `Open campaign ${name}`}
        className={cn(
          "absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      />

      <motion.article
        layout
        initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? undefined : { duration: 0.25, ease: "easeOut" }}
        className={cn(
          "pointer-events-none relative z-[1] rounded-xl border border-border bg-card p-4 transition-all",
          "group-hover:scale-[1.02] group-hover:border-border/80 group-hover:shadow-md",
          "group-active:scale-[0.98]"
        )}
      >
        <div className="pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-1">
          <span
            className={cn(
              "pointer-events-none inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              statusTone.badge
            )}
          >
            {status === "live" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden /> : null}
            {statusTone.label}
          </span>

          {showPencil ? (
            <Link
              href={editHref!}
              title="Edit campaign"
              aria-label={`Edit campaign ${name}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm",
                "transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Campaign actions"
                aria-label={`More actions for ${name}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm",
                  "transition-colors hover:bg-muted hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              <DropdownMenuItem asChild>
                <Link href={viewHref} className="cursor-pointer">
                  <Eye className="h-4 w-4" />
                  {viewMenuLabel}
                </Link>
              </DropdownMenuItem>
              {showEdit ? (
                <DropdownMenuItem asChild>
                  <Link href={editHref!} className="cursor-pointer">
                    <Pencil className="h-4 w-4" />
                    Edit campaign
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault()
                  void copyMbaNumber()
                }}
              >
                <Copy className="h-4 w-4" />
                Copy MBA number
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={downloadHref} className="cursor-pointer">
                  <Download className="h-4 w-4" />
                  Download summary
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="pr-[7.5rem] sm:pr-[8.5rem]">
          <p className="line-clamp-1 text-sm font-medium text-foreground">{name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{mbaNumber}</p>
        </div>

        <div className={cn("mb-3 mt-3", mediaChannelTagRowClassName)}>
          {visibleTags.map((tag) => (
            <MediaChannelTag key={`${id}-${tag}`} label={tag} />
          ))}
          {hiddenTagCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              +{hiddenTagCount} more
            </span>
          ) : null}
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.75, ease: "easeOut" }}
            className={cn("h-full rounded-full", getProgressTone(progressPct))}
          />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {formatCurrencyCompact(spentAmount)} / {formatCurrencyCompact(totalBudget)}
          </p>
          <p className="text-xs font-medium text-foreground">{Math.round(progressPct).toLocaleString("en-US")}%</p>
        </div>
      </motion.article>
    </div>
  )
}
