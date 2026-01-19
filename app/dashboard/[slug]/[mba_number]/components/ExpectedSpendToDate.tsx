"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"

type ExpectedSpendToDateProps = {
  mbaNumber: string
  campaignStart?: string
  campaignEnd?: string
}

type ApiResponse = {
  expectedSpendToDate?: number
  asOf?: string
  error?: string
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function ExpectedSpendToDate({
  mbaNumber,
  campaignStart,
  campaignEnd,
}: ExpectedSpendToDateProps) {
  const [value, setValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!mbaNumber) {
      setValue(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (campaignStart) params.set("campaignStart", campaignStart)
        if (campaignEnd) params.set("campaignEnd", campaignEnd)

        const query = params.toString()
        const url = `/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}/expected-spend-to-date${
          query ? `?${query}` : ""
        }`

        const res = await fetch(url, { cache: "no-store", signal: controller.signal })
        if (!res.ok) {
          setValue(null)
          return
        }
        const json = (await res.json()) as ApiResponse
        if (typeof json.expectedSpendToDate === "number" && Number.isFinite(json.expectedSpendToDate)) {
          setValue(json.expectedSpendToDate)
        } else {
          setValue(null)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setValue(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => controller.abort()
  }, [mbaNumber, campaignStart, campaignEnd])

  if (loading) {
    return <Skeleton className="h-9 w-28 rounded-md" />
  }

  if (value === null) {
    return <span className="text-muted-foreground">—</span>
  }

  return <span>{formatCurrency(value)}</span>
}
