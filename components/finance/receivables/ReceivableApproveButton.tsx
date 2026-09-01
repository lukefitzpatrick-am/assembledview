"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { approveBillingRecords, unapproveBillingRecords } from "@/lib/finance/api"
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

  if (state !== "ready" && state !== "approved") return null
  if (!grain) return null

  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (state === "ready") {
        await approveBillingRecords({
          invoice_keys: [grain.invoice_key],
          billing_month: grain.billing_month,
        })
        toast({ title: "Approved" })
      } else {
        await unapproveBillingRecords({ invoice_keys: [grain.invoice_key] })
        toast({ title: "Approval cleared" })
      }
      onDone?.()
    } catch (e) {
      toast({
        variant: "destructive",
        title: state === "ready" ? "Could not approve" : "Could not unapprove",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={state === "ready" ? "default" : "outline"}
      disabled={busy}
      onClick={() => void run()}
    >
      {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
      {state === "ready" ? "Approve" : "Unapprove"}
    </Button>
  )
}
