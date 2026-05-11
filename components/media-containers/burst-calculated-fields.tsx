"use client"

import { useEffect, useMemo } from "react"
import type {
  ControllerRenderProps,
  FieldValues,
  UseFormReturn,
} from "react-hook-form"
import { useWatch } from "react-hook-form"
import { FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  roundDeliverables,
} from "@/lib/mediaplan/deliverableBudget"

export type NetMediaForBurstFn = (
  rawBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
) => number

export type CpcFamilyVariant = "cpcCpvCpm" | "newspaper" | "magazine" | "radio" | "cinema" | "ooh"

type CpcFamilyProps<T extends FieldValues> = {
  form: UseFormReturn<T>
  itemsKey: string
  lineItemIndex: number
  burstIndex: number
  field: ControllerRenderProps<T>
  feePct: number
  /**
   * @deprecated The component now uses computeDeliverableFromMedia
   * internally and does not call this prop. Kept for backward
   * compatibility with existing callsites - safe to omit in new code.
   */
  netMedia?: NetMediaForBurstFn
  variant?: CpcFamilyVariant
  inputClassName?: string
  bonusInputClassName?: string
}

function displayCalculated(calculatedValue: string | number): string {
  return Number(calculatedValue).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function titleForVariant(variant: CpcFamilyVariant, buyType: string): string {
  switch (variant) {
    case "cpcCpvCpm":
      switch (buyType) {
        case "cpc":
          return "Clicks"
        case "cpv":
          return "Views"
        case "cpm":
          return "Impressions"
        case "fixed_cost":
          return "Fixed Cost"
        default:
          return "Calculated Value"
      }
    case "newspaper":
    case "magazine":
      switch (buyType) {
        case "cpc":
          return "Clicks"
        case "cpv":
          return "Views"
        case "cpm":
          return "Impressions"
        case "fixed_cost":
          return "Fixed Cost"
        case "package":
          return "Package"
        case "insertions":
          return "Insertions"
        default:
          return "Calculated Value"
      }
    case "radio":
      switch (buyType) {
        case "spots":
          return "Spots"
        case "package":
          return "Package"
        case "cpm":
          return "Impressions"
        case "fixed_cost":
          return "Fixed Cost"
        default:
          return "Calculated Value"
      }
    case "cinema":
      switch (buyType) {
        case "spots":
          return "Spots"
        case "cpm":
          return "Impressions"
        case "fixed_cost":
          return "Fixed Cost"
        case "package":
          return "Package"
        default:
          return "Calculated Value"
      }
    case "ooh":
      switch (buyType) {
        case "cpc":
          return "Clicks"
        case "cpv":
          return "Views"
        case "cpm":
          return "Impressions"
        case "panels":
          return "Panels"
        case "fixed_cost":
          return "Fixed Cost"
        case "package":
          return "Package"
        default:
          return "Calculated Value"
      }
    default:
      return "Calculated Value"
  }
}

/** Column header text aligned with `CpcFamilyBurstCalculatedField` labels (no new copy). */
export function getCpcFamilyBurstCalculatedColumnLabel(
  variant: CpcFamilyVariant,
  buyType: string
): string {
  if (buyType === "bonus" || buyType === "package_inclusions") return "Bonus Deliverables"
  return titleForVariant(variant, buyType)
}

/** Column header text aligned with `TelevisionBurstTarpsField` labels. */
export function getTelevisionBurstCalculatedColumnLabel(buyType: string): string {
  if (buyType === "bonus" || buyType === "package_inclusions") return "Bonus Deliverables"
  let title = "Calculated Value"
  switch (buyType) {
    case "cpt":
      title = "TARPs"
      break
    case "spots":
      title = "Spots"
      break
    case "package":
      title = "Package"
      break
    case "cpm":
      title = "Impressions"
      break
    case "fixed_cost":
      title = "Fixed Cost"
      break
    default:
      break
  }
  return title
}

/** Column header text aligned with `SocialLineBurstCalculatedField` labels. */
export function getSocialBurstCalculatedColumnLabel(buyType: string): string {
  if (buyType === "bonus" || buyType === "package_inclusions") return "Bonus Deliverables"
  let title = "Calculated Value"
  switch (buyType) {
    case "cpc":
      title = "Clicks"
      break
    case "cpv":
      title = "Views"
      break
    case "cpm":
      title = "Impressions"
      break
    case "fixed_cost":
      title = "Fixed Cost"
      break
    default:
      break
  }
  return title
}

/** CPC/CPV/CPM-style burst calculated readouts; hooks run at component top level (not inside FormField render callbacks). */
export function CpcFamilyBurstCalculatedField<T extends FieldValues>({
  form,
  itemsKey,
  lineItemIndex,
  burstIndex,
  field,
  feePct,
  netMedia: _deprecatedNetMedia,
  variant = "cpcCpvCpm",
  inputClassName = "w-full min-w-[8rem] h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground",
  bonusInputClassName,
}: CpcFamilyProps<T>) {
  const buyType = useWatch({
    control: form.control,
    name: `${itemsKey}.${lineItemIndex}.buyType` as never,
  }) as unknown as string
  const budgetValue = useWatch({
    control: form.control,
    name: `${itemsKey}.${lineItemIndex}.bursts.${burstIndex}.budget` as never,
  })
  const buyAmountValue = useWatch({
    control: form.control,
    name: `${itemsKey}.${lineItemIndex}.bursts.${burstIndex}.buyAmount` as never,
  })
  const budgetIncludesFees = useWatch({
    control: form.control,
    name: `${itemsKey}.${lineItemIndex}.budgetIncludesFees` as never,
  })

  const calculatedValue = useMemo(() => {
    if (buyType === "bonus" || buyType === "package_inclusions") {
      return "0"
    }
    if (buyType === "package") {
      return String(field.value ?? "0")
    }
    const rawBudget = parseFloat(String(budgetValue)?.replace(/[^0-9.]/g, "") || "0")
    const buyAmount = parseFloat(String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1")
    const bt = coerceBuyTypeWithDevWarn(buyType, "CpcFamilyBurstCalculatedField")

    const value = computeDeliverableFromMedia({
      buyType: bt,
      rawBudget,
      buyAmount,
      budgetIncludesFees: !!budgetIncludesFees,
      feePct,
    })

    if (Number.isNaN(value)) return "0"
    return String(value)
  }, [budgetValue, buyAmountValue, buyType, budgetIncludesFees, feePct, field.value])

  const bonusClass =
    bonusInputClassName ?? (variant === "cpcCpvCpm" ? "w-full" : "w-full h-10 text-sm")

  if (buyType === "bonus" || buyType === "package_inclusions") {
    return (
      <FormItem>
        <FormControl>
          <Input
            type="number"
            min={0}
            step={1}
            className={bonusClass}
            value={field.value ?? ""}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, "")
              field.onChange(value)
            }}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )
  }

  return (
    <FormItem>
      <FormControl>
        <Input
          type="text"
          className={inputClassName}
          value={displayCalculated(calculatedValue)}
          readOnly
        />
      </FormControl>
    </FormItem>
  )
}

const TELEVISION_ITEMS_KEY = "televisionlineItems"

type TelevisionTarpsProps<T extends FieldValues> = {
  form: UseFormReturn<T>
  lineItemIndex: number
  burstIndex: number
  field: ControllerRenderProps<T>
  feePct: number
}

export function TelevisionBurstTarpsField<T extends FieldValues>({
  form,
  lineItemIndex,
  burstIndex,
  field,
  feePct,
}: TelevisionTarpsProps<T>) {
  const buyTypeWatch = useWatch({
    control: form.control,
    name: `${TELEVISION_ITEMS_KEY}.${lineItemIndex}.buyType` as never,
  }) as unknown as string
  const budgetIncludesFees = useWatch({
    control: form.control,
    name: `${TELEVISION_ITEMS_KEY}.${lineItemIndex}.budgetIncludesFees` as never,
  })
  const budgetValue = useWatch({
    control: form.control,
    name: `${TELEVISION_ITEMS_KEY}.${lineItemIndex}.bursts.${burstIndex}.budget` as never,
  })
  const buyAmountValue = useWatch({
    control: form.control,
    name: `${TELEVISION_ITEMS_KEY}.${lineItemIndex}.bursts.${burstIndex}.buyAmount` as never,
  })

  const calculatedValue = useMemo(() => {
    if (buyTypeWatch === "bonus" || buyTypeWatch === "package_inclusions") {
      return "0"
    }
    if (buyTypeWatch === "package") {
      return String(field.value ?? "0")
    }
    const rawBudget = parseFloat(String(budgetValue)?.replace(/[^0-9.]/g, "") || "0")
    const buyAmount = parseFloat(String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1")
    const bt = coerceBuyTypeWithDevWarn(String(buyTypeWatch || ""), "TelevisionBurstTarpsField")

    const value = computeDeliverableFromMedia({
      buyType: bt,
      rawBudget,
      buyAmount,
      budgetIncludesFees: !!budgetIncludesFees,
      feePct,
    })

    if (Number.isNaN(value)) return String(field.value ?? "0")
    return String(roundDeliverables(bt, value))
  }, [budgetValue, buyAmountValue, buyTypeWatch, budgetIncludesFees, feePct, field.value])

  useEffect(() => {
    if (
      buyTypeWatch === "bonus" ||
      buyTypeWatch === "package_inclusions" ||
      buyTypeWatch === "package"
    ) {
      return
    }
    const tarpsPath =
      `${TELEVISION_ITEMS_KEY}.${lineItemIndex}.bursts.${burstIndex}.tarps` as const
    const calcPath =
      `${TELEVISION_ITEMS_KEY}.${lineItemIndex}.bursts.${burstIndex}.calculatedValue` as const
    const newValue = calculatedValue
    const currentTarps = form.getValues(tarpsPath as never)
    if (String(currentTarps ?? "") !== newValue) {
      form.setValue(tarpsPath as never, newValue as never)
    }
    const nextNum = parseFloat(String(newValue).replace(/[^0-9.]/g, "")) || 0
    const curCalc = form.getValues(calcPath as never)
    const curNum =
      typeof curCalc === "number" && Number.isFinite(curCalc)
        ? curCalc
        : parseFloat(String(curCalc ?? "0").replace(/[^0-9.]/g, "")) || 0
    if (Math.abs(curNum - nextNum) > 1e-6) {
      form.setValue(calcPath as never, nextNum as never, {
        shouldValidate: false,
        shouldDirty: false,
      })
    }
  }, [
    calculatedValue,
    lineItemIndex,
    burstIndex,
    form,
    buyTypeWatch,
  ])

  if (buyTypeWatch === "bonus" || buyTypeWatch === "package_inclusions") {
    return (
      <FormItem>
        <FormLabel className="text-xs">Bonus Deliverables</FormLabel>
        <FormControl>
          <Input
            type="number"
            min={0}
            step={1}
            className="w-full"
            value={field.value ?? ""}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, "")
              field.onChange(value)
            }}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )
  }

  const title = getTelevisionBurstCalculatedColumnLabel(String(buyTypeWatch || ""))
  const displayNumeric =
    typeof calculatedValue === "number"
      ? calculatedValue
      : parseFloat(String(calculatedValue)) || 0

  return (
    <FormItem>
      <FormLabel className="text-xs">{title}</FormLabel>
      <FormControl>
        <Input
          type="text"
          className="w-full min-w-[8rem] h-10 text-sm"
          value={displayNumeric.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          readOnly
        />
      </FormControl>
    </FormItem>
  )
}

type SocialBurstProps<T extends FieldValues> = {
  form: UseFormReturn<T>
  lineItemIndex: number
  burstIndex: number
  field: ControllerRenderProps<T>
  buyType: string
  feePct: number
  /**
   * @deprecated The component now uses computeDeliverableFromMedia
   * internally and does not call this prop. Kept for backward
   * compatibility with existing callsites - safe to omit in new code.
   */
  netMedia?: NetMediaForBurstFn
}

export function SocialLineBurstCalculatedField<T extends FieldValues>({
  form,
  lineItemIndex,
  burstIndex,
  field,
  buyType,
  feePct,
}: SocialBurstProps<T>) {
  const itemsKey = "lineItems"
  const budgetIncludesFees = useWatch({
    control: form.control,
    name: `${itemsKey}.${lineItemIndex}.budgetIncludesFees` as never,
  })
  const budgetRaw = useWatch({
    control: form.control,
    name: `${itemsKey}.${lineItemIndex}.bursts.${burstIndex}.budget` as never,
  })
  const buyAmountRaw = useWatch({
    control: form.control,
    name: `${itemsKey}.${lineItemIndex}.bursts.${burstIndex}.buyAmount` as never,
  })

  const calculatedValue = useMemo(() => {
    const btLower = String(buyType || "").toLowerCase()
    if (btLower === "bonus" || btLower === "package_inclusions") {
      return "0"
    }
    if (btLower === "package") {
      return String(field.value ?? "0")
    }
    const rawBudget = parseFloat(String(budgetRaw)?.replace(/[^0-9.]/g, "") || "0")
    const buyAmount = parseFloat(String(buyAmountRaw)?.replace(/[^0-9.]/g, "") || "1")
    const bt = coerceBuyTypeWithDevWarn(buyType, "SocialLineBurstCalculatedField")

    const value = computeDeliverableFromMedia({
      buyType: bt,
      rawBudget,
      buyAmount,
      budgetIncludesFees: !!budgetIncludesFees,
      feePct,
    })

    if (Number.isNaN(value)) return "0"
    return String(value)
  }, [budgetRaw, buyAmountRaw, buyType, budgetIncludesFees, feePct, field.value])

  if (buyType === "bonus" || buyType === "package_inclusions") {
    return (
      <FormItem>
        <FormControl>
          <Input
            type="number"
            min={0}
            step={1}
            className="w-full h-10 text-sm"
            value={field.value ?? ""}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, "")
              field.onChange(value)
            }}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )
  }

  return (
    <FormItem>
      <FormControl>
        <Input
          type="text"
          className="w-full min-w-[8rem] h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
          value={displayCalculated(calculatedValue)}
          readOnly
        />
      </FormControl>
    </FormItem>
  )
}
