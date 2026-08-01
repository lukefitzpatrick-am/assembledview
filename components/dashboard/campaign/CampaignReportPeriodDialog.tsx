"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import { cn } from "@/lib/utils"

export type CampaignReportPeriodDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mbaNumber: string
  clientName?: string | null
  campaignName?: string | null
  versionNumber?: number
  campaignStartISO?: string | null
  campaignEndISO?: string | null
}

const PERIOD_OPTIONS: Array<{ kind: CampaignReportPeriodKind; label: string; hint: string }> = [
  {
    kind: "this_month",
    label: "This month",
    hint: "From the first of the current Melbourne month to today.",
  },
  {
    kind: "last_month",
    label: "Last month",
    hint: "Full previous Melbourne calendar month.",
  },
  {
    kind: "campaign_to_date",
    label: "Campaign to date",
    hint: "Campaign start through today (or campaign end).",
  },
  {
    kind: "custom",
    label: "Custom range",
    hint: "Choose inclusive start and end dates.",
  },
]

export function CampaignReportPeriodDialog({
  open,
  onOpenChange,
  mbaNumber,
  clientName,
  campaignName,
  versionNumber,
  campaignStartISO,
  campaignEndISO,
}: CampaignReportPeriodDialogProps) {
  const { toast } = useToast()
  const [periodKind, setPeriodKind] = useState<CampaignReportPeriodKind>("this_month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [busy, setBusy] = useState(false)

  const canSubmit =
    periodKind !== "custom" ||
    (Boolean(customStart.trim()) &&
      Boolean(customEnd.trim()) &&
      customEnd >= customStart)

  const handleExport = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/campaigns/export-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        body: JSON.stringify({
          mbaNumber,
          clientName: clientName ?? undefined,
          campaignName: campaignName ?? undefined,
          versionNumber,
          campaignStartISO: campaignStartISO ?? undefined,
          campaignEndISO: campaignEndISO ?? undefined,
          periodKind,
          customStartISO: periodKind === "custom" ? customStart : undefined,
          customEndISO: periodKind === "custom" ? customEnd : undefined,
        }),
      })

      if (!res.ok) {
        let message = `Export failed (${res.status})`
        try {
          const err = (await res.json()) as { message?: string; error?: string }
          message = err.message || err.error || message
        } catch {
          // keep status message
        }
        throw new Error(message)
      }

      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") || ""
      const match = /filename="([^"]+)"/i.exec(cd)
      const filename = match?.[1] || `campaign-report-${mbaNumber}.pptx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "Report ready",
        description: filename,
      })
      onOpenChange(false)
    } catch (err) {
      toast({
        title: "Could not export report",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review and report</DialogTitle>
          <DialogDescription>
            Choose the reporting period for MBA {mbaNumber}. Admin only. Commentary on the
            deck is a placeholder until the insight skill is wired.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => setPeriodKind(opt.kind)}
              className={cn(
                "interactive-tint w-full rounded-input border px-3 py-2.5 text-left transition-colors",
                periodKind === opt.kind
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-table-row-hover",
              )}
            >
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{opt.hint}</p>
            </button>
          ))}

          {periodKind === "custom" ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="report-start">Start</Label>
                <Input
                  id="report-start"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-end">End</Label>
                <Input
                  id="report-end"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!canSubmit || busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building deck
              </>
            ) : (
              "Download report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
