"use client"

/**
 * S7: the Tracking control on a line card (switch `line_tracking_type`).
 * Shows the line's resolved tracking type; the default is marked. Picking the
 * default stores nothing, so the line keeps following its default.
 */
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"

import { HelpTip } from "@/components/help/Help"
import type { LineChannel } from "@/db/schema/lineChannelValues"
import {
  defaultTrackingType,
  resolveTrackingType,
  TRACKING_TYPE_LABELS,
  TRACKING_TYPES,
} from "@/lib/delivery/trackingType"
import { clientFeatureOn } from "@/lib/features/client"

type Props<T extends FieldValues> = {
  form: UseFormReturn<T>
  itemsKey: string
  lineItemIndex: number
  channel: LineChannel
  lineLabel: string
}

const WATCHED = ["trackingType", "publisher", "platform", "noadserving", "noAdserving"] as const

export function TrackingTypeField<T extends FieldValues>({ form, itemsKey, lineItemIndex, channel, lineLabel }: Props<T>) {
  const prefix = `${itemsKey}.${lineItemIndex}`
  const values = useWatch({
    control: form.control,
    name: WATCHED.map((key) => `${prefix}.${key}`) as Path<T>[],
  }) as unknown[]
  if (!clientFeatureOn("line_tracking_type")) return null

  const line = Object.fromEntries(WATCHED.map((key, i) => [key, values[i]]))
  const fallback = defaultTrackingType(channel, line)
  const id = `tracking-type-${itemsKey}-${lineItemIndex}`

  return (
    <div className="flex items-center gap-1.5" data-testid="tracking-type-field">
      <label htmlFor={id} className="whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">
        Tracking
      </label>
      <select
        id={id}
        aria-label={`Tracking type for ${lineLabel}`}
        className="h-7 rounded-md border border-input bg-background px-2 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={resolveTrackingType(channel, line)}
        onChange={(event) =>
          form.setValue(`${prefix}.trackingType` as Path<T>, (event.target.value === fallback ? "" : event.target.value) as never, {
            shouldDirty: true,
          })
        }
      >
        {TRACKING_TYPES.map((type) => (
          <option key={type} value={type}>
            {TRACKING_TYPE_LABELS[type]}
            {type === fallback ? " (default)" : ""}
          </option>
        ))}
      </select>
      <HelpTip id="lineTrackingType" label={`Tracking type for ${lineLabel}`} />
    </div>
  )
}
