"use client"

import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  CheckSquare,
  Clock,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PacingStatus } from "@/lib/xano/pacing-types"

const STATUS_LABEL: Record<PacingStatus, string> = {
  not_started: "Not started",
  on_track: "On track",
  slightly_under: "Slightly under",
  under_pacing: "Under pacing",
  slightly_over: "Slightly over",
  over_pacing: "Over pacing",
  no_delivery: "No delivery",
  completed: "Completed",
}

function normalizeStatus(raw: string | null | undefined): PacingStatus | "unknown" {
  const s = String(raw ?? "").trim().toLowerCase().replace(/ /g, "_")
  if (s in STATUS_LABEL) return s as PacingStatus
  return "unknown"
}

export function PacingStatusPill({ status }: { status: string | null | undefined }) {
  const key = normalizeStatus(status)
  const label =
    key === "unknown" ? (status ? String(status) : "Unknown") : STATUS_LABEL[key as PacingStatus]

  const inner = (() => {
    if (key === "on_track") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      )
    }
    if (key === "slightly_under") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <TrendingDown className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      )
    }
    if (key === "slightly_over") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      )
    }
    if (key === "under_pacing" || key === "over_pacing") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      )
    }
    if (key === "no_delivery") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/60 bg-transparent px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      )
    }
    if (key === "not_started") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      )
    }
    if (key === "completed") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/40 bg-transparent px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <CheckSquare className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </span>
    )
  })()

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("cursor-default")}>{inner}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
