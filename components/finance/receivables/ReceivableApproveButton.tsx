"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import {
  approveBillingRecords,
  unapproveBillingRecords,
} from "@/lib/finance/api"
import { grainFromBillingRecord } from "@/lib/finance/billingApproveGrain"
import type { BillingRecord } from "@/lib/types/financeBilling"

type Props = {
  record: BillingRecord
  onDone?: () => void
}

export function ReceivableApproveButton({ record, onDone }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const state = record.state ?? "ready"
  const grain = grainFromBillingRecord(record)
  const drifted = record.approved_drift === true
  const canReapprove = drifted && state === "approved"

  if (!grain) return null
  if (state !== "ready" && state !== "approved") return null

  const run = async (action: "approve" | "unapprove" | "reapprove") => {
    if (busy) return
    setBusy(true)
    try {
      if (action === "approve" || action === "reapprove") {
        await approveBillingRecords({
          invoice_keys: [grain.invoice_key],
          billing_month: grain.billing_month,
          ...(action === "reapprove" ? { reapprove: true } : {}),
        })
        toast({ title: action === "reapprove" ? "Re-approved at the current amount" : "Approved" })
      } else {
        await unapproveBillingRecords({ invoice_keys: [grain.invoice_key] })
        toast({ title: "Approval cleared" })
      }
      onDone?.()
    } catch (e) {
      const titles: Record<typeof action, string> = {
        approve: "Could not approve",
        reapprove: "Could not re-approve",
        unapprove: "Could not unapprove",
      }
      toast({
        variant: "destructive",
        title: titles[action],
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      {state === "ready" ? (
        <Button type="button" size="sm" disabled={busy} onClick={() => void run("approve")}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Approve
        </Button>
      ) : null}
      {canReapprove ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run("reapprove")}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Re-approve at the current amount
        </Button>
      ) : null}
      {state === "approved" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run("unapprove")}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Unapprove
        </Button>
      ) : null}
    </span>
  )
}
