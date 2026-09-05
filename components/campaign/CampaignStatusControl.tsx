"use client"

import { useState } from "react"

import { Combobox } from "@/components/ui/combobox"
import { toast } from "@/components/ui/use-toast"
import {
  isUnauthorizedStatus,
  noteWriteUnauthorized,
} from "@/lib/auth/writeSessionExpiry"
import {
  campaignStatusDisplayLabel,
  isSelectableCampaignStatus,
  normaliseStatus,
  SELECTABLE_CAMPAIGN_STATUSES,
} from "@/lib/mediaplan/campaignStatusGuard"

const SELECTABLE_OPTIONS = SELECTABLE_CAMPAIGN_STATUSES.map((value) => ({
  value,
  label: campaignStatusDisplayLabel(value),
}))

export async function persistCampaignStatus(input: {
  next: string
  persisted: boolean
  mbaNumber?: string | null
  onStatusCommitted: (status: string) => void
  setPending?: (pending: boolean) => void
}): Promise<void> {
  const {
    next,
    persisted,
    mbaNumber,
    onStatusCommitted,
    setPending,
  } = input
  if (!isSelectableCampaignStatus(next)) return
  const mba = String(mbaNumber ?? "").trim()
  if (!persisted || !mba) {
    onStatusCommitted(next)
    return
  }
  setPending?.(true)
  try {
    const res = await fetch(
      `/api/mediaplans/mba/${encodeURIComponent(mba)}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      }
    )
    if (isUnauthorizedStatus(res.status)) {
      noteWriteUnauthorized()
      toast({
        variant: "destructive",
        title: "Session expired",
        description: "Sign in again, then retry the status change.",
      })
      return
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      toast({
        variant: "destructive",
        title: "Status not saved",
        description: body.error || "Could not update campaign status.",
      })
      return
    }
    onStatusCommitted(next)
    toast({
      title: "Status updated",
      description: `Campaign is now ${campaignStatusDisplayLabel(next)}.`,
    })
  } catch {
    toast({
      variant: "destructive",
      title: "Status not saved",
      description: "Could not update campaign status.",
    })
  } finally {
    setPending?.(false)
  }
}

export function CampaignStatusControl({
  mbaNumber,
  persisted,
  status,
  onStatusCommitted,
  disabled,
}: {
  mbaNumber?: string | null
  persisted: boolean
  status: string
  startDate?: unknown
  endDate?: unknown
  onStatusCommitted: (status: string) => void
  disabled?: boolean
}) {
  const [pending, setPending] = useState(false)
  const normalised = normaliseStatus(status)
  const selectable = isSelectableCampaignStatus(normalised)
  const legacy = normalised === "draft" || normalised === "completed"

  async function persist(next: string) {
    await persistCampaignStatus({
      next,
      persisted,
      mbaNumber,
      onStatusCommitted,
      setPending,
    })
  }

  return (
    <div className="space-y-2">
      {legacy ? (
        <p className="text-sm text-muted-foreground">
          Currently {campaignStatusDisplayLabel(normalised)} (legacy). Pick a
          status to update — this value is not rewritten until you choose.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          value={selectable ? normalised : ""}
          onValueChange={(next) => {
            void persist(next)
          }}
          placeholder="Select campaign status"
          searchPlaceholder="Search statuses..."
          options={SELECTABLE_OPTIONS}
          preserveOrder
          disabled={disabled || pending}
        />
      </div>
    </div>
  )
}
