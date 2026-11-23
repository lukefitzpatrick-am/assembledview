"use client"

import { Copy, Plus, Trash2 } from "lucide-react"
import type { FieldValues, UseFormReturn } from "react-hook-form"

import { EndDateOrderMessage } from "@/components/mediaplan/EndDateOrderMessage"
import {
  BurstDateRangeColumn,
  BurstFieldGrid,
  BurstFieldLabel,
  BurstLabel,
  BurstReadonlyMetric,
  BurstRowCard,
  BurstRowInner,
  BurstSection,
} from "@/components/media-containers/BurstRowLayout"
import { Button } from "@/components/ui/button"
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { NumericInput } from "@/components/ui/NumericInput"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { formatBurstLabel } from "@/lib/bursts"
import { formatAUD } from "@/lib/format/money"
import { MP_BURST_ACTION_COLUMN, MP_BURST_GRID_5 } from "@/lib/mediaplan/burstSectionLayout"

/**
 * A channel whose bursts are a unit cost and a quantity, not a budget
 * (Production, W5l; `costQuantityBursts`). Moved from its container: the same
 * five columns, the same money (cost x quantity) and the same date pickers.
 * `onValueChange` writes the burst's standard money keys after each edit.
 */
export function CostQuantityBurstRows<T extends FieldValues>({
  form,
  itemsKey,
  lineItemIndex,
  noun,
  campaignStartDate,
  campaignEndDate,
  onValueChange,
  onAppendBurst,
  onDuplicateBurst,
  onRemoveBurst,
}: {
  form: UseFormReturn<T>
  itemsKey: string
  lineItemIndex: number
  /** The channel's name: the burst heading and its total ("Production Total"). */
  noun: string
  campaignStartDate: Date
  campaignEndDate: Date
  onValueChange: (lineItemIndex: number) => void
  onAppendBurst: (lineItemIndex: number) => void
  onDuplicateBurst: (lineItemIndex: number) => void
  onRemoveBurst: (lineItemIndex: number, burstIndex: number) => void
}) {
  const path = `${itemsKey}.${lineItemIndex}`
  const bursts = (form.watch(`${path}.bursts` as never) || []) as unknown as Array<{
    cost?: number | null
    amount?: number | null
    startDate?: Date
    endDate?: Date
    _reactKey?: string
  }>
  const line = lineItemIndex + 1

  return (
    <BurstSection>
      {bursts.map((burst, burstIndex) => {
        const mediaValue = (burst.cost || 0) * (burst.amount || 0)
        return (
          <BurstRowCard key={burst._reactKey ?? `${lineItemIndex}-${burstIndex}`}>
            <BurstRowInner>
              <BurstLabel>
                {formatBurstLabel(burstIndex + 1, burst.startDate, burst.endDate, { noun })}
              </BurstLabel>

              <BurstFieldGrid className={MP_BURST_GRID_5}>
                <FormField
                  control={form.control}
                  name={`${path}.bursts.${burstIndex}.cost` as never}
                  render={({ field }) => (
                    <FormItem>
                      <BurstFieldLabel>Cost</BurstFieldLabel>
                      <FormControl>
                        <MoneyInput
                          ref={field.ref}
                          name={field.name}
                          onBlur={field.onBlur}
                          aria-label={`Cost, burst ${burstIndex + 1}, line ${line}`}
                          className="h-10 w-full min-w-0 text-sm"
                          value={field.value as number | null}
                          onChange={(v) => {
                            field.onChange(v ?? 0)
                            onValueChange(lineItemIndex)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`${path}.bursts.${burstIndex}.amount` as never}
                  render={({ field }) => (
                    <FormItem>
                      <BurstFieldLabel>Quantity</BurstFieldLabel>
                      <FormControl>
                        <NumericInput
                          ref={field.ref}
                          name={field.name}
                          onBlur={field.onBlur}
                          aria-label={`Quantity, burst ${burstIndex + 1}, line ${line}`}
                          decimals={0}
                          className="h-10 w-full min-w-0 text-sm"
                          value={field.value as number | null}
                          onChange={(v) => {
                            field.onChange(v ?? 0)
                            onValueChange(lineItemIndex)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <BurstDateRangeColumn>
                  <FormField
                    control={form.control}
                    name={`${path}.bursts.${burstIndex}.startDate` as never}
                    render={({ field }) => (
                      <FormItem>
                        <BurstFieldLabel>Start Date</BurstFieldLabel>
                        <FormControl>
                          <SingleDatePicker
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={field.value as Date | undefined}
                            onChange={field.onChange}
                            className="h-10 w-full pl-2 text-left text-sm font-normal"
                            calendarContext="media-burst"
                            mediaBurstRole="start"
                            campaignStartDate={campaignStartDate}
                            campaignEndDate={campaignEndDate}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`${path}.bursts.${burstIndex}.endDate` as never}
                    render={({ field }) => (
                      <FormItem>
                        <BurstFieldLabel>End Date</BurstFieldLabel>
                        <FormControl>
                          <SingleDatePicker
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={field.value as Date | undefined}
                            onChange={field.onChange}
                            className="h-10 w-full pl-2 text-left text-sm font-normal"
                            calendarContext="media-burst"
                            mediaBurstRole="end"
                            campaignStartDate={campaignStartDate}
                            campaignEndDate={campaignEndDate}
                          />
                        </FormControl>
                        <FormMessage />
                        <EndDateOrderMessage
                          start={form.watch(`${path}.bursts.${burstIndex}.startDate` as never)}
                          end={field.value as Date | undefined}
                        />
                      </FormItem>
                    )}
                  />
                </BurstDateRangeColumn>

                <BurstReadonlyMetric label={`${noun} Total`} muted value={formatAUD(mediaValue)} />
              </BurstFieldGrid>

              <div className={MP_BURST_ACTION_COLUMN}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 text-sm px-3"
                  onClick={() => onAppendBurst(lineItemIndex)}
                  aria-label={`Add burst to line ${line}`}
                >
                  <Plus className="h-4 w-4 mr-1" aria-hidden />
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 text-sm px-3"
                  onClick={() => onDuplicateBurst(lineItemIndex)}
                  aria-label={`Duplicate burst on line ${line}`}
                >
                  <Copy className="h-4 w-4 mr-1" aria-hidden />
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 text-sm px-3"
                  onClick={() => onRemoveBurst(lineItemIndex, burstIndex)}
                  aria-label={`Remove burst ${burstIndex + 1} from line ${line}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </BurstRowInner>
          </BurstRowCard>
        )
      })}
    </BurstSection>
  )
}
