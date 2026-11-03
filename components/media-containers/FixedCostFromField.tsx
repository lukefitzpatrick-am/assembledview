"use client"

/**
 * B23 FC2: "From" date beside the Fixed Cost Media box on a line card.
 * Shown only when the `fixed_cost_from_date` switch is on and the box is
 * ticked. Blank means fixed cost for the whole flight. The date can be in the
 * past but must sit inside the line's flight (checked here and on save).
 */
import * as React from "react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { clientFeatureOn } from "@/lib/features/client"
import {
  fixedCostFromIssue,
  lineFlightFromBursts,
  normaliseFixedCostFrom,
} from "@/lib/mediaplan/fixedCostFrom"

type Props<T extends FieldValues> = {
  form: UseFormReturn<T>
  itemsKey: string
  lineItemIndex: number
  lineLabel: string
}

function name<T extends FieldValues>(itemsKey: string, index: number, key: string): Path<T> {
  return `${itemsKey}.${index}.${key}` as Path<T>
}

export function fixedCostFromFieldVisible(switchOn: boolean, fixedCostMedia: unknown): boolean {
  return switchOn && fixedCostMedia === true
}

export function FixedCostFromField<T extends FieldValues>({
  form,
  itemsKey,
  lineItemIndex,
  lineLabel,
}: Props<T>) {
  const switchOn = clientFeatureOn("fixed_cost_from_date")
  const fixedCostMedia = useWatch({
    control: form.control,
    name: name<T>(itemsKey, lineItemIndex, "fixedCostMedia"),
  }) as unknown
  const value = useWatch({
    control: form.control,
    name: name<T>(itemsKey, lineItemIndex, "fixedCostFrom"),
  }) as unknown
  const bursts = useWatch({
    control: form.control,
    name: name<T>(itemsKey, lineItemIndex, "bursts"),
  }) as unknown

  if (!fixedCostFromFieldVisible(switchOn, fixedCostMedia)) return null

  const flight = lineFlightFromBursts(bursts)
  const current = normaliseFixedCostFrom(value) ?? ""
  const issue = fixedCostFromIssue(value, bursts)
  const id = `fixed-cost-from-${itemsKey}-${lineItemIndex}`

  return (
    <div className="flex items-center gap-1.5" data-testid="fixed-cost-from-field">
      <label htmlFor={id} className="whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">
        From
      </label>
      <Input
        id={id}
        type="date"
        className="h-7 w-[8.5rem] px-2 text-[11px]"
        aria-label={`Fixed cost from date for ${lineLabel}`}
        aria-invalid={issue ? true : undefined}
        title="Blank: fixed cost for the whole flight. Days before this date keep actual delivery."
        min={flight?.start}
        max={flight?.end}
        value={current}
        onChange={(event) =>
          form.setValue(name<T>(itemsKey, lineItemIndex, "fixedCostFrom"), event.target.value as never, {
            shouldDirty: true,
          })
        }
      />
      {issue ? (
        <span role="alert" className="max-w-[16rem] text-[11px] leading-tight text-destructive">
          {issue}
        </span>
      ) : null}
    </div>
  )
}
