"use client"

import { Combobox } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import {
  MBA_NONE_VALUE,
  campaignsForClientFromPlans,
  mbaSelectCampaigns,
  type MbaPlanRow,
} from "@/lib/codex/clientMbas"

export function TaskMbaSelect({
  clientId,
  value,
  plans,
  onChange,
  disabled = false,
  id = "task-mba",
  hideLabel = false,
  buttonClassName = "num max-w-md",
}: {
  clientId: number | null
  value: string
  plans: MbaPlanRow[]
  onChange: (mbaNumber: string | null) => void
  disabled?: boolean
  id?: string
  hideLabel?: boolean
  buttonClassName?: string
}) {
  const clientChosen = clientId != null && clientId > 0
  const campaigns = mbaSelectCampaigns(
    campaignsForClientFromPlans(plans, clientId),
    value,
  )
  const selectValue = value.trim() || MBA_NONE_VALUE
  const locked = disabled || !clientChosen
  const options = [
    { value: MBA_NONE_VALUE, label: "None" },
    ...campaigns.map((c) => ({
      value: c.mba_number,
      label: c.label,
      keywords: `${c.mba_number} ${c.campaign_name}`,
    })),
  ]

  return (
    <div className={hideLabel ? undefined : "space-y-1.5"}>
      {hideLabel ? null : <Label htmlFor={id}>MBA number</Label>}
      <Combobox
        id={id}
        options={options}
        value={locked ? MBA_NONE_VALUE : selectValue}
        onValueChange={(next) => {
          if (next === MBA_NONE_VALUE) {
            onChange(null)
            return
          }
          onChange(next)
        }}
        placeholder={
          clientChosen ? "Select a campaign" : "Select a client first"
        }
        searchPlaceholder="Search MBA or campaign…"
        disabled={locked}
        preserveOrder
        buttonClassName={buttonClassName}
      />
      {clientChosen ? (
        <p
          className="sr-only"
          data-mba-order={campaigns.map((c) => c.mba_number).join(", ")}
          data-mba-labels={campaigns.map((c) => c.label).join(", ")}
        >
          Campaign MBA numbers, newest first:{" "}
          {campaigns.map((c) => c.label).join(", ") || "none"}
        </p>
      ) : hideLabel ? null : (
        <p className="text-xs text-muted-foreground">Select a client first</p>
      )}
      {!hideLabel && clientChosen && campaigns.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No campaigns for this client
        </p>
      ) : null}
    </div>
  )
}
