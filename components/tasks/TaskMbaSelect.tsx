"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MBA_NONE_VALUE,
  mbaSelectOptions,
  mbasForClientFromPlans,
  type MbaPlanRow,
} from "@/lib/codex/clientMbas"

export function TaskMbaSelect({
  clientId,
  value,
  plans,
  onChange,
  disabled = false,
}: {
  clientId: number | null
  value: string
  plans: MbaPlanRow[]
  onChange: (mbaNumber: string | null) => void
  disabled?: boolean
}) {
  const clientChosen = clientId != null && clientId > 0
  const options = mbaSelectOptions(
    mbasForClientFromPlans(plans, clientId),
    value,
  )
  const selectValue = value.trim() || MBA_NONE_VALUE
  const locked = disabled || !clientChosen

  return (
    <div className="space-y-1.5">
      <Label htmlFor="task-mba">MBA number</Label>
      <Select
        value={locked ? MBA_NONE_VALUE : selectValue}
        onValueChange={(next) => {
          if (next === MBA_NONE_VALUE) {
            onChange(null)
            return
          }
          onChange(next)
        }}
        disabled={locked}
      >
        <SelectTrigger id="task-mba" className="num max-w-md">
          <SelectValue
            placeholder={
              clientChosen ? "Select a campaign" : "Select a client first"
            }
          />
        </SelectTrigger>
        {clientChosen ? (
          <SelectContent>
            <SelectItem value={MBA_NONE_VALUE}>None</SelectItem>
            {options.map((mba) => (
              <SelectItem key={mba} value={mba} className="num">
                {mba}
              </SelectItem>
            ))}
          </SelectContent>
        ) : null}
      </Select>
      {clientChosen ? (
        <p className="sr-only" data-mba-order={options.join(", ")}>
          Campaign MBA numbers, newest first: {options.join(", ") || "none"}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Select a client first</p>
      )}
      {clientChosen && options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No campaigns for this client
        </p>
      ) : null}
    </div>
  )
}
