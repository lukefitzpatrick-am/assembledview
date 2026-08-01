"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { endOfMonth, format, startOfMonth, subDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import { CalendarDays, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

function parseDateOnlySafe(value?: string | null): Date | null {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null

  // Prefer YYYY-MM-DD; treat as local date.
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const year = Number(m[1])
    const monthIndex = Number(m[2]) - 1
    const day = Number(m[3])
    const d = new Date(year, monthIndex, day)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toISODateOnlyLocal(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

export type AdminDateRangeSelectorProps = {
  campaignStart?: string
  campaignEnd?: string
  variant?: "standalone" | "inline" | "minimal"
  showPresets?: boolean
}

function sameDate(a?: Date, b?: Date): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return toISODateOnlyLocal(a) === toISODateOnlyLocal(b)
}

function sameRange(a?: DateRange, b?: DateRange): boolean {
  return sameDate(a?.from, b?.from) && sameDate(a?.to, b?.to)
}

/** Clamp a date into [min, max] when bounds exist. */
function clampDate(d: Date, min: Date | null, max: Date | null): Date {
  let t = d.getTime()
  if (min && t < min.getTime()) t = min.getTime()
  if (max && t > max.getTime()) t = max.getTime()
  return new Date(t)
}

/**
 * Clamp a preset range to the campaign flight so presets never select outside
 * the campaign (which yields an empty dashboard that looks like missing data).
 */
function clampRangeToCampaign(
  range: DateRange | undefined,
  campaignFrom: Date | null,
  campaignTo: Date | null,
): DateRange | undefined {
  if (!range?.from || !range?.to) return range
  if (!campaignFrom && !campaignTo) return range
  let from = clampDate(range.from, campaignFrom, campaignTo)
  let to = clampDate(range.to, campaignFrom, campaignTo)
  if (from.getTime() > to.getTime()) {
    const swap = from
    from = to
    to = swap
  }
  return { from, to }
}

export default function AdminDateRangeSelector({
  campaignStart,
  campaignEnd,
  variant = "standalone",
  showPresets = true,
}: AdminDateRangeSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const campaignFrom = useMemo(() => parseDateOnlySafe(campaignStart), [campaignStart])
  const campaignTo = useMemo(() => parseDateOnlySafe(campaignEnd), [campaignEnd])

  const urlFrom = useMemo(
    () => parseDateOnlySafe(searchParams?.get("startDate")),
    [searchParams]
  )
  const urlTo = useMemo(
    () => parseDateOnlySafe(searchParams?.get("endDate")),
    [searchParams]
  )

  const selected: DateRange | undefined = useMemo(() => {
    if (urlFrom || urlTo) return { from: urlFrom ?? undefined, to: urlTo ?? undefined }
    if (campaignFrom || campaignTo) return { from: campaignFrom ?? undefined, to: campaignTo ?? undefined }
    return undefined
  }, [urlFrom, urlTo, campaignFrom, campaignTo])

  const selectedFromTime = selected?.from?.getTime()
  const selectedToTime = selected?.to?.getTime()

  // Keep a local draft so the user can pick both dates without the page
  // navigating/reloading after the first click.
  const [draft, setDraft] = useState<DateRange | undefined>(selected)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setDraft(selected)
  }, [selected, selectedFromTime, selectedToTime])

  const setParams = (next: URLSearchParams) => {
    const qs = next.toString()
    const base = pathname ?? "/"
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false })
  }

  const handleChange = (next: DateRange | undefined) => {
    setDraft(next)

    // Only apply once we have a complete range. This prevents the URL (and SSR)
    // from changing after the first click, which makes range selection feel "stuck".
    if (!next?.from || !next?.to) return

    const nextParams = new URLSearchParams(searchParams?.toString() ?? "")

    if (!next?.from) {
      nextParams.delete("startDate")
      nextParams.delete("endDate")
      setParams(nextParams)
      return
    }

    nextParams.set("startDate", toISODateOnlyLocal(next.from))

    nextParams.set("endDate", toISODateOnlyLocal(next.to))

    setParams(nextParams)
  }

  const applyRange = (next: DateRange | undefined) => {
    if (!next?.from || !next?.to) return
    const clamped = clampRangeToCampaign(next, campaignFrom, campaignTo)
    handleChange(clamped)
    setOpen(false)
  }

  const handleReset = () => {
    const nextParams = new URLSearchParams(searchParams?.toString() ?? "")
    nextParams.delete("startDate")
    nextParams.delete("endDate")
    setParams(nextParams)
    setDraft(campaignRange)
  }

  const canReset = Boolean(
    searchParams?.get("startDate") || searchParams?.get("endDate")
  )
  const campaignRange = useMemo<DateRange | undefined>(() => {
    if (!campaignFrom && !campaignTo) return undefined
    return { from: campaignFrom ?? undefined, to: campaignTo ?? undefined }
  }, [campaignFrom, campaignTo])
  const isCustom = canReset && !sameRange(selected, campaignRange)

  const rangeLabel = useMemo(() => {
    if (!selected?.from && !selected?.to) return "Full campaign"
    if (selected?.from && selected?.to) {
      return `${format(selected.from, "dd MMM yyyy")} - ${format(selected.to, "dd MMM yyyy")}`
    }
    if (selected?.from) return format(selected.from, "dd MMM yyyy")
    return "Date range"
  }, [selected])

  const presets = useMemo(() => {
    const today = new Date()
    const fullCampaign: DateRange | undefined =
      campaignFrom && campaignTo
        ? { from: campaignFrom, to: campaignTo }
        : undefined
    return [
      { id: "full", label: "Full campaign", range: fullCampaign },
      {
        id: "last7",
        label: "Last 7 days",
        range: clampRangeToCampaign(
          { from: subDays(today, 6), to: today },
          campaignFrom,
          campaignTo,
        ),
      },
      {
        id: "last30",
        label: "Last 30 days",
        range: clampRangeToCampaign(
          { from: subDays(today, 29), to: today },
          campaignFrom,
          campaignTo,
        ),
      },
      {
        id: "thisMonth",
        label: "This month",
        range: clampRangeToCampaign(
          { from: startOfMonth(today), to: endOfMonth(today) },
          campaignFrom,
          campaignTo,
        ),
      },
      { id: "custom", label: "Custom range", range: undefined },
    ] as const
  }, [campaignFrom, campaignTo])

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Keep current selection visible in the calendar (do not blank it).
      setDraft(selected)
    }
    setOpen(next)
  }

  const calendarDisabled = useMemo(() => {
    if (!campaignFrom && !campaignTo) return undefined
    return (date: Date) => {
      if (campaignFrom && date < campaignFrom) return true
      if (campaignTo && date > campaignTo) return true
      return false
    }
  }, [campaignFrom, campaignTo])

  const presetButtons = showPresets ? (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const isCustomPreset = preset.id === "custom"
        const unavailable = !isCustomPreset && !preset.range?.from
        return (
          <Button
            key={preset.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-pill text-xs"
            disabled={isCustomPreset || unavailable}
            title={
              isCustomPreset
                ? "Use the calendar below to pick a custom range"
                : unavailable
                  ? "Campaign dates are required for this preset"
                  : undefined
            }
            onClick={() => {
              if (isCustomPreset || !preset.range) return
              applyRange(preset.range)
            }}
          >
            {preset.label}
          </Button>
        )
      })}
    </div>
  ) : null

  const calendar = (
    <Calendar
      mode="range"
      numberOfMonths={2}
      defaultMonth={selected?.from ?? campaignFrom ?? undefined}
      selected={draft}
      onSelect={(next) => {
        const clamped =
          next?.from && next?.to
            ? clampRangeToCampaign(next, campaignFrom, campaignTo)
            : next
        setDraft(clamped)
        if (clamped?.from && clamped?.to) applyRange(clamped)
      }}
      disabled={calendarDisabled}
      initialFocus
    />
  )

  const triggerInline = (
    <div className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Date range:</span>
      <span className={cn("font-medium", isCustom && "text-primary")}>{rangeLabel}</span>
      {isCustom ? <Badge variant="outline" className="h-5 rounded-pill px-2 text-[10px]">Custom</Badge> : null}
      <button type="button" className="text-primary underline-offset-2 hover:underline">
        Change
      </button>
    </div>
  )

  const triggerMinimal = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 min-w-[7.5rem] justify-center gap-2 rounded-pill border-border bg-background text-xs font-medium shadow-e0 backdrop-blur-sm transition-all hover:scale-[1.02] hover:bg-table-row-hover"
    >
      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
      Change range
    </Button>
  )

  if (variant === "standalone") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-card px-3 py-2 shadow-e0">
        <Badge variant="outline" className="rounded-pill text-[11px]">
          Admin
        </Badge>
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          Date window
        </div>
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 rounded-pill px-3">
              <span className={cn("font-medium", isCustom && "text-primary")}>{rangeLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <div className="space-y-3 p-3">
              {presetButtons}
              {calendar}
            </div>
          </PopoverContent>
        </Popover>
        {canReset ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-pill px-3 text-muted-foreground hover:text-foreground"
            onClick={handleReset}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          {variant === "inline" ? triggerInline : triggerMinimal}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <div className="space-y-3 p-3">
            {presetButtons}
            {calendar}
          </div>
        </PopoverContent>
      </Popover>
      {canReset ? (
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={handleReset}
        >
          Reset
        </button>
      ) : null}
    </div>
  )
}
