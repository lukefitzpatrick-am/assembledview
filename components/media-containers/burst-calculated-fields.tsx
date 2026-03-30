"use client"

import { useEffect, useMemo } from "react"
import type {
  ControllerRenderProps,
  FieldValues,
  UseFormReturn,
} from "react-hook-form"
import { useWatch } from "react-hook-form"
import { FormControl, FormItem, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

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
  netMedia: NetMediaForBurstFn
  variant?: CpcFamilyVariant
  inputClassName?: string
  bonusInputClassName?: string
}

function displayCalculated(calculatedValue: string | number): string {
  return Number(calculatedValue).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function calcForVariant(
  variant: CpcFamilyVariant,
  buyType: string,
  budget: number,
  buyAmount: number
): string {
  switch (variant) {
    case "cpcCpvCpm":
      switch (buyType) {
        case "cpc":
        case "cpv":
          return buyAmount !== 0 ? String(budget / buyAmount) : "0"
        case "cpm":
          return buyAmount !== 0 ? String((budget / buyAmount) * 1000) : "0"
        case "fixed_cost":
          return "1"
        default:
          return "0"
      }
    case "newspaper":
    case "magazine":
      switch (buyType) {
        case "cpc":
        case "insertions":
        case "cpv":
          return buyAmount !== 0 ? String(budget / buyAmount) : "0"
        case "cpm":
          return buyAmount !== 0 ? String((budget / buyAmount) * 1000) : "0"
        case "fixed_cost":
        case "package":
          return "1"
        default:
          return "0"
      }
    case "radio":
      switch (buyType) {
        case "spots":
        case "package":
          return buyAmount !== 0 ? String(budget / buyAmount) : "0"
        case "cpm":
          return buyAmount !== 0 ? String((budget / buyAmount) * 1000) : "0"
        case "fixed_cost":
          return "1"
        default:
          return "0"
      }
    case "cinema":
      switch (buyType) {
        case "spots":
        case "screens":
        case "cpc":
        case "cpv":
          return buyAmount !== 0 ? String(budget / buyAmount) : "0"
        case "cpm":
          return buyAmount !== 0 ? String((budget / buyAmount) * 1000) : "0"
        case "fixed_cost":
        case "package":
          return "1"
        default:
          return "0"
      }
    case "ooh":
      switch (buyType) {
        case "cpc":
        case "cpv":
        case "panels":
          return buyAmount !== 0 ? String(budget / buyAmount) : "0"
        case "cpm":
          return buyAmount !== 0 ? String((budget / buyAmount) * 1000) : "0"
        case "fixed_cost":
        case "package":
          return "1"
        default:
          return "0"
      }
    default:
      return "0"
  }
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
  netMedia,
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
    const rawBudget = parseFloat(String(budgetValue)?.replace(/[^0-9.]/g, "") || "0")
    const budget = netMedia(rawBudget, !!budgetIncludesFees, feePct)
    const buyAmount = parseFloat(String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1")
    return calcForVariant(variant, buyType, budget, buyAmount)
  }, [budgetValue, buyAmountValue, buyType, budgetIncludesFees, feePct, netMedia, variant])

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

type TelevisionTarpsProps<T extends FieldValues> = {
  form: UseFormReturn<T>
  lineItemIndex: number
  burstIndex: number
  field: ControllerRenderProps<T>
}

export function TelevisionBurstTarpsField<T extends FieldValues>({
  form,
  lineItemIndex,
  burstIndex,
  field,
}: TelevisionTarpsProps<T>) {
  const itemsKey = "televisionlineItems"
  const buyTypeWatch = useWatch({
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

  const calculatedValue = useMemo(() => {
    const budget = parseFloat(String(budgetValue)?.replace(/[^0-9.]/g, "") || "0")
    const buyAmount = parseFloat(String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1")

    switch (buyTypeWatch) {
      case "cpt":
      case "spots":
        return buyAmount !== 0 ? String(budget / buyAmount) : "0"
      case "cpm":
        return buyAmount !== 0 ? String((budget / buyAmount) * 1000) : "0"
      case "fixed_cost":
        return "1"
      default:
        return "0"
    }
  }, [budgetValue, buyAmountValue, buyTypeWatch])

  useEffect(() => {
    if (buyTypeWatch === "bonus" || buyTypeWatch === "package_inclusions") return
    const tarpsPath =
      `televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.tarps`
    const currentValue = form.getValues(tarpsPath as never)
    const newValue = String(calculatedValue)

    if (String(currentValue ?? "") !== newValue) {
      form.setValue(tarpsPath as never, newValue as never)
    }
  }, [calculatedValue, lineItemIndex, burstIndex, form, buyTypeWatch])

  if (buyTypeWatch === "bonus" || buyTypeWatch === "package_inclusions") {
    return (
      <FormItem>
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

type SocialBurstProps<T extends FieldValues> = {
  form: UseFormReturn<T>
  lineItemIndex: number
  burstIndex: number
  field: ControllerRenderProps<T>
  buyType: string
  feePct: number
  netMedia: NetMediaForBurstFn
}

export function SocialLineBurstCalculatedField<T extends FieldValues>({
  form,
  lineItemIndex,
  burstIndex,
  field,
  buyType,
  feePct,
  netMedia,
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
    const rawBudget = parseFloat(String(budgetRaw)?.replace(/[^0-9.]/g, "") || "0")
    const budget = netMedia(rawBudget, !!budgetIncludesFees, feePct)
    const buyAmount = parseFloat(String(buyAmountRaw)?.replace(/[^0-9.]/g, "") || "1")

    switch (buyType) {
      case "cpc":
      case "cpv":
        return buyAmount !== 0 ? (budget / buyAmount).toString() : "0"
      case "cpm":
        return buyAmount !== 0 ? ((budget / buyAmount) * 1000).toString() : "0"
      case "fixed_cost":
        return "1"
      default:
        return "0"
    }
  }, [budgetRaw, buyAmountRaw, buyType, budgetIncludesFees, feePct, netMedia])

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
