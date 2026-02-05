"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"

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
}

export default function AdminDateRangeSelector({ campaignStart, campaignEnd }: AdminDateRangeSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const campaignFrom = useMemo(() => parseDateOnlySafe(campaignStart), [campaignStart])
  const campaignTo = useMemo(() => parseDateOnlySafe(campaignEnd), [campaignEnd])

  const urlFrom = useMemo(() => parseDateOnlySafe(searchParams.get("startDate")), [searchParams])
  const urlTo = useMemo(() => parseDateOnlySafe(searchParams.get("endDate")), [searchParams])

  const selected: DateRange | undefined = useMemo(() => {
    if (urlFrom || urlTo) return { from: urlFrom ?? undefined, to: urlTo ?? undefined }
    if (campaignFrom || campaignTo) return { from: campaignFrom ?? undefined, to: campaignTo ?? undefined }
    return undefined
  }, [urlFrom, urlTo, campaignFrom, campaignTo])

  // Keep a local draft so the user can pick both dates without the page
  // navigating/reloading after the first click.
  const [draft, setDraft] = useState<DateRange | undefined>(selected)

  useEffect(() => {
    setDraft(selected)
  }, [selected?.from?.getTime(), selected?.to?.getTime()])

  const setParams = (next: URLSearchParams) => {
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const handleChange = (next: DateRange | undefined) => {
    setDraft(next)

    // Only apply once we have a complete range. This prevents the URL (and SSR)
    // from changing after the first click, which makes range selection feel "stuck".
    if (!next?.from || !next?.to) return

    const nextParams = new URLSearchParams(searchParams.toString())

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

  const handleReset = () => {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("startDate")
    nextParams.delete("endDate")
    setParams(nextParams)
    setDraft(undefined)
  }

  const canReset = Boolean(searchParams.get("startDate") || searchParams.get("endDate"))

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-muted/70 bg-background/80 p-3 md:flex-row md:items-center md:justify-between">
      <div className="text-sm font-medium text-foreground">Filter by date</div>
      <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
        <div className="w-full md:w-[320px]">
          <DateRangePicker value={draft} onChange={handleChange} />
        </div>
        <Button variant="ghost" className="justify-start md:justify-center" onClick={handleReset} disabled={!canReset}>
          Reset
        </Button>
      </div>
    </div>
  )
}

