"use client"

import { useCallback, useState } from "react"
import { saveAs } from "file-saver"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import { AlterBillingDialog } from "@/components/billing/AlterBillingDialog"
import type { BillingMonth } from "@/lib/billing/types"
import type { MediaPlanGroup } from "@/lib/finance/useReceivablesData"

type MediaPlanActionBarProps = {
  mp: MediaPlanGroup
  billingMonth: string
  onSaved: () => void
}

export function MediaPlanActionBar({ mp, billingMonth, onSaved }: MediaPlanActionBarProps) {
  const [isDownloadingAa, setIsDownloadingAa] = useState(false)
  const [isLoadingAlter, setIsLoadingAlter] = useState(false)
  const [alterMonths, setAlterMonths] = useState<BillingMonth[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const downloadAa = useCallback(async () => {
    if (!mp.mbaNumber) return
    setIsDownloadingAa(true)
    const fallbackName = `AA-${mp.mbaNumber}-${billingMonth}.xlsx`
    try {
      const url = `/api/finance/receivables/aa-media-plan?mba_number=${encodeURIComponent(
        mp.mbaNumber
      )}&billing_month=${encodeURIComponent(billingMonth)}`
      const res = await fetch(url)
      if (!res.ok) {
        let message = `Download failed (${res.status})`
        try {
          const body = (await res.json()) as { error?: string }
          if (body?.error) message = String(body.error)
        } catch {
          // ignore
        }
        toast({ variant: "destructive", title: "AA media plan", description: message })
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition")
      let filename = fallbackName
      if (cd) {
        const star = /filename\*=UTF-8''([^;\s]+)/i.exec(cd)
        if (star?.[1]) {
          try {
            filename = decodeURIComponent(star[1].trim())
          } catch {
            // keep fallback
          }
        } else {
          const quoted = /filename="([^"]+)"/i.exec(cd)
          if (quoted?.[1]) filename = quoted[1]
        }
      }
      saveAs(blob, filename)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "AA media plan",
        description: e instanceof Error ? e.message : "Download failed",
      })
    } finally {
      setIsDownloadingAa(false)
    }
  }, [mp.mbaNumber, billingMonth])

  const openAlter = useCallback(async () => {
    if (!mp.mbaNumber || mp.versionId == null || mp.versionNumber == null) return
    setIsLoadingAlter(true)
    try {
      const res = await fetch(
        `/api/mediaplans/mba/${encodeURIComponent(mp.mbaNumber)}?billingScheduleFull=1&version=${mp.versionNumber}`
      )
      if (!res.ok) {
        let message = `Load failed (${res.status})`
        try {
          const body = (await res.json()) as { error?: string }
          if (body?.error) message = String(body.error)
        } catch {
          // ignore
        }
        toast({ variant: "destructive", title: "Alter Billing", description: message })
        return
      }
      const data = (await res.json()) as { billingSchedule?: unknown }
      const months = parsePersistedBillingScheduleToMonths(data.billingSchedule)
      if (!months || months.length === 0) {
        toast({
          variant: "destructive",
          title: "Alter Billing",
          description: "No billing schedule found for this version.",
        })
        return
      }
      setAlterMonths(months)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Alter Billing",
        description: e instanceof Error ? e.message : "Failed to load billing schedule",
      })
    } finally {
      setIsLoadingAlter(false)
    }
  }, [mp.mbaNumber, mp.versionId, mp.versionNumber])

  const canAlter = Boolean(mp.mbaNumber) && mp.versionId != null && mp.versionNumber != null

  if (!mp.mbaNumber) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled
        title="No MBA number on billing rows for this group"
      >
        Edit
      </Button>
    )
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <a
            href={`/mediaplans/mba/${encodeURIComponent(mp.mbaNumber)}/edit`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Edit
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isDownloadingAa}
          onClick={() => void downloadAa()}
        >
          {isDownloadingAa ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              AA…
            </>
          ) : (
            <>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              AA plan
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isLoadingAlter || !canAlter}
          onClick={() => void openAlter()}
        >
          {isLoadingAlter ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              Billing…
            </>
          ) : (
            "Alter Billing"
          )}
        </Button>
      </div>
      {alterMonths ? (
        <AlterBillingDialog
          open
          onOpenChange={(open) => {
            if (!open) setAlterMonths(null)
          }}
          initialMonths={alterMonths}
          title={mp.mbaNumber}
          mbaNumber={mp.mbaNumber}
          isSaving={isSaving}
          onSave={async (newMonths) => {
            if (mp.versionId == null) return
            setIsSaving(true)
            try {
              const res = await fetch(
                `/api/mediaplans/versions/${mp.versionId}/billing-schedule`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ billingSchedule: buildBillingScheduleJSON(newMonths) }),
                }
              )
              if (!res.ok) {
                const err = (await res.json().catch(() => ({ error: "Save failed" }))) as { error?: string }
                throw new Error(err.error || "Save failed")
              }
              setAlterMonths(null)
              onSaved()
              toast({ title: "Billing updated", description: "Billing schedule saved for this version." })
            } catch (e) {
              toast({
                variant: "destructive",
                title: "Alter Billing",
                description: e instanceof Error ? e.message : "Save failed",
              })
            } finally {
              setIsSaving(false)
            }
          }}
        />
      ) : null}
    </>
  )
}
