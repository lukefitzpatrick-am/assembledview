"use client"

import * as React from "react"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { AutoGrowField } from "@/components/media-containers/AutoGrowField"
import {
  CpcFamilyBurstCalculatedField,
  getCpcFamilyBurstCalculatedColumnLabel,
  type CpcFamilyVariant,
} from "@/components/media-containers/burst-calculated-fields"
import { formatBurstLabel } from "@/lib/bursts"
import { formatMoney, parseMoneyInput } from "@/lib/format/money"
import { withInjectedComboboxValue } from "@/lib/mediaplan/comboboxCurrentValue"
import {
  getExpertCardSurfaceFields,
  getExpertOptionFlags,
  type ExpertDescriptorColumn,
  type ExpertGridChannelConfig,
  type ExpertScheduleRowCommon,
} from "@/lib/mediaplan/expertGridChannelConfig"
import {
  MP_BURST_ACTION_COLUMN,
  MP_BURST_CARD,
  MP_BURST_CARD_CONTENT,
  MP_BURST_GRID_7,
  MP_BURST_HEADER_INNER,
  MP_BURST_HEADER_ROW,
  MP_BURST_HEADER_SHELL,
  MP_BURST_LABEL_COLUMN,
  MP_BURST_LABEL_HEADING,
  MP_BURST_ROW_SHELL,
  MP_BURST_SECTION_OUTER,
} from "@/lib/mediaplan/burstSectionLayout"
import { cn } from "@/lib/utils"

type ExpertCardPublisher = { publisher_name: string }

/** Card-surface (key, label) pairs — same list ExpertCard renders. */
export function getExpertCardRenderedFields(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "descriptorCore" | "descriptorTail"
  >
): { key: string; label: string }[] {
  return getExpertCardSurfaceFields(config).map(({ key, label }) => ({ key, label }))
}

export type ExpertCardProps<T extends FieldValues> = {
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
  form: UseFormReturn<T>
  /** RHF array path, e.g. `lineItems` or `radiolineItems`. */
  itemsKey: string
  lineItemIndex: number
  lineItemId: string
  collapsed?: boolean
  onToggleCollapsed?: () => void
  /** Preformatted total shown in the card header. */
  totalDisplay: string
  publishers: ExpertCardPublisher[]
  /** Station options when config includes `combobox-stations`. */
  stationOptions?: ComboboxOption[]
  /** Extra options for `combobox-dynamic` / `combobox-sites` / `combobox-titles`. */
  dynamicOptionsByKey?: Record<string, ComboboxOption[]>
  feePct: number
  calculatedVariant?: CpcFamilyVariant
  campaignStartDate: Date
  campaignEndDate: Date
  onBurstValueChange: (lineItemIndex: number, burstIndex: number) => void
  onAppendBurst: (lineItemIndex: number) => void
  onDuplicateBurst: (lineItemIndex: number, burstIndex: number) => void
  onRemoveBurst: (lineItemIndex: number, burstIndex: number) => void
  /** Fired when Budget Includes Fees toggles (recalc bursts). */
  onBudgetIncludesFeesChange?: (lineItemIndex: number, checked: boolean) => void
  /**
   * Optional combobox change hook (e.g. buyType → zero burst budgets).
   * Called after the field value is written.
   */
  onComboboxValueChange?: (
    key: string,
    lineItemIndex: number,
    value: string
  ) => void
  /**
   * Optional text/input change hook (e.g. line-level size → sync burst sizes).
   * Called after the field value is written for non-combobox fields.
   */
  onFieldValueChange?: (
    key: string,
    lineItemIndex: number,
    value: string
  ) => void
  /** Extra UI beside a card field control (e.g. station “add” button). */
  fieldAdornments?: Partial<Record<string, React.ReactNode>>
  /** Per-key Combobox overrides (disabled, emptyText, placeholders). */
  comboboxPropsByKey?: Partial<
    Record<
      string,
      {
        disabled?: boolean
        emptyText?: string
        placeholder?: string
        searchPlaceholder?: string
        buttonClassName?: string
      }
    >
  >
  /**
   * Custom bursts UI (e.g. Television TARPs). When set, skips generic
   * {@link ExpertCardBursts}.
   */
  burstsSlot?: React.ReactNode
  summaryRow?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

function fieldName<T extends FieldValues>(
  itemsKey: string,
  lineItemIndex: number,
  key: string
): Path<T> {
  return `${itemsKey}.${lineItemIndex}.${key}` as Path<T>
}

function burstFieldName<T extends FieldValues>(
  itemsKey: string,
  lineItemIndex: number,
  burstIndex: number,
  key: string
): Path<T> {
  return `${itemsKey}.${lineItemIndex}.bursts.${burstIndex}.${key}` as Path<T>
}

function parseBudgetRaw(raw: unknown): number {
  if (typeof raw === "number") return raw
  if (typeof raw !== "string") return 0
  return parseFloat(raw.replace(/[^0-9.]/g, "") || "0") || 0
}

function isComboboxDescriptorKind(kind: ExpertDescriptorColumn["kind"]): boolean {
  return (
    kind === "combobox-publishers" ||
    kind === "combobox-static" ||
    kind === "combobox-dynamic" ||
    kind === "combobox-sites" ||
    kind === "combobox-stations" ||
    kind === "combobox-titles"
  )
}

const EXPERT_CARD_LABEL =
  "text-[11px] font-medium uppercase tracking-wider text-muted-foreground"

type ExpertCardFieldLayout = "combobox" | "compact-text" | "primary-text" | "default"

type ExpertDescriptorWithCardPrimary = ExpertDescriptorColumn & {
  cardPrimary?: boolean
}

/**
 * Pick the one primary free-text field per channel (right 2 cols on lg).
 * Prefers explicit `cardPrimary`, then creativeTargeting, then other *targeting* keys,
 * placement, description, else first text field.
 */
export function resolveExpertCardPrimaryTextField(
  textFields: ExpertDescriptorColumn[]
): ExpertDescriptorColumn | null {
  if (textFields.length === 0) return null

  const explicit = textFields.find(
    (d) => (d as ExpertDescriptorWithCardPrimary).cardPrimary === true
  )
  if (explicit) return explicit

  const creativeTargeting = textFields.find((d) => d.key === "creativeTargeting")
  if (creativeTargeting) return creativeTargeting

  const targeting = textFields.find(
    (d) => d.key.includes("targeting") && d.key !== "creativeTargeting"
  )
  if (targeting) return targeting

  const placement = textFields.find((d) => d.key === "placement")
  if (placement) return placement

  const description = textFields.find((d) => d.key === "description")
  if (description) return description

  return textFields[0]
}

function ExpertCardFieldControl<T extends FieldValues>({
  d,
  form,
  itemsKey,
  lineItemIndex,
  publishers,
  stationOptions,
  dynamicOptionsByKey,
  campaignStartDate,
  campaignEndDate,
  onComboboxValueChange,
  onFieldValueChange,
  fieldAdornment,
  comboboxProps,
  fieldLayout = "default",
}: {
  d: ExpertDescriptorColumn
  form: UseFormReturn<T>
  itemsKey: string
  lineItemIndex: number
  publishers: ExpertCardPublisher[]
  stationOptions: ComboboxOption[]
  dynamicOptionsByKey: Record<string, ComboboxOption[]>
  campaignStartDate: Date
  campaignEndDate: Date
  onComboboxValueChange?: (
    key: string,
    lineItemIndex: number,
    value: string
  ) => void
  onFieldValueChange?: (
    key: string,
    lineItemIndex: number,
    value: string
  ) => void
  fieldAdornment?: React.ReactNode
  comboboxProps?: {
    disabled?: boolean
    emptyText?: string
    placeholder?: string
    searchPlaceholder?: string
    buttonClassName?: string
  }
  fieldLayout?: ExpertCardFieldLayout
}) {
  const name = fieldName<T>(itemsKey, lineItemIndex, d.key)
  const publisherOptions = publishers.map((p) => ({
    value: p.publisher_name,
    label: p.publisher_name,
  }))

  const comboboxOptions = (): ComboboxOption[] => {
    const current = form.getValues(name) as string | undefined
    let options: ComboboxOption[] = []
    switch (d.kind) {
      case "combobox-publishers":
        // Keep saved platforms selectable/renderable even if missing from the
        // filtered publisher list (e.g. Influencer Management without flag),
        // and while the shared publishers fetch is still in flight.
        options = publisherOptions
        break
      case "combobox-static":
        options = d.options ?? []
        break
      case "combobox-stations":
        options = stationOptions
        break
      case "combobox-dynamic":
      case "combobox-sites":
      case "combobox-titles":
        options = dynamicOptionsByKey[d.key] ?? []
        break
      default:
        options = []
    }
    return withInjectedComboboxValue(options, current)
  }

  if (
    d.kind === "combobox-publishers" ||
    d.kind === "combobox-static" ||
    d.kind === "combobox-stations" ||
    d.kind === "combobox-dynamic" ||
    d.kind === "combobox-sites" ||
    d.kind === "combobox-titles"
  ) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => {
          const combobox = (
            <Combobox
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value)
                onComboboxValueChange?.(d.key, lineItemIndex, value)
              }}
              options={comboboxOptions()}
              placeholder={
                comboboxProps?.placeholder ?? d.placeholder ?? "Select"
              }
              searchPlaceholder={
                comboboxProps?.searchPlaceholder ??
                d.searchPlaceholder ??
                `Search ${d.label.toLowerCase()}...`
              }
              disabled={comboboxProps?.disabled}
              emptyText={comboboxProps?.emptyText}
              buttonClassName={cn(
                "h-8 w-full truncate rounded-md",
                comboboxProps?.buttonClassName
              )}
              className="w-full truncate"
            />
          )

          return (
            <FormItem className="flex w-full flex-col space-y-1">
              <FormLabel className={EXPERT_CARD_LABEL}>{d.label}</FormLabel>
              {fieldAdornment ? (
                <div className="flex flex-1 items-center space-x-1">
                  <FormControl>{combobox}</FormControl>
                  {fieldAdornment}
                </div>
              ) : (
                <FormControl>{combobox}</FormControl>
              )}
              <FormMessage />
            </FormItem>
          )
        }}
      />
    )
  }

  if (d.kind === "date-start" || d.kind === "date-end") {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className="flex flex-col space-y-1">
            <FormLabel className={EXPERT_CARD_LABEL}>{d.label}</FormLabel>
            <FormControl>
              <SingleDatePicker
                ref={field.ref}
                name={field.name}
                onBlur={field.onBlur}
                value={field.value}
                onChange={field.onChange}
                className="h-8 w-full pl-2 text-left text-sm font-normal"
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  if (d.kind === "unit-rate") {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className="flex flex-col space-y-1">
            <FormLabel className={EXPERT_CARD_LABEL}>{d.label}</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="number"
                placeholder={d.placeholder}
                className="h-8 w-full text-sm"
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e)
                  onFieldValueChange?.(d.key, lineItemIndex, e.target.value)
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  if (d.kind === "checkbox-billing") {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className="flex items-center space-x-2">
            <FormControl>
              <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="text-sm">{d.label}</FormLabel>
          </FormItem>
        )}
      />
    )
  }

  if (d.kind === "text") {
    const isPrimary = fieldLayout === "primary-text"
    const isCompact = fieldLayout === "compact-text"

    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem
            className={cn(
              "flex w-full flex-col space-y-1",
              isPrimary && "h-full min-h-[7rem]"
            )}
          >
            <FormLabel className={EXPERT_CARD_LABEL}>{d.label}</FormLabel>
            <FormControl>
              <AutoGrowField
                ref={field.ref}
                name={field.name}
                value={(field.value as string | undefined) ?? ""}
                onBlur={field.onBlur}
                placeholder={d.placeholder}
                singleLine={isCompact}
                className={cn(isPrimary && "h-full min-h-[7rem]")}
                onChange={(e) => {
                  field.onChange(e)
                  onFieldValueChange?.(d.key, lineItemIndex, e.target.value)
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  return null
}

function ExpertCardBursts<T extends FieldValues>({
  form,
  itemsKey,
  lineItemIndex,
  feePct,
  calculatedVariant,
  campaignStartDate,
  campaignEndDate,
  onBurstValueChange,
  onAppendBurst,
  onDuplicateBurst,
  onRemoveBurst,
}: {
  form: UseFormReturn<T>
  itemsKey: string
  lineItemIndex: number
  feePct: number
  calculatedVariant: CpcFamilyVariant
  campaignStartDate: Date
  campaignEndDate: Date
  onBurstValueChange: (lineItemIndex: number, burstIndex: number) => void
  onAppendBurst: (lineItemIndex: number) => void
  onDuplicateBurst: (lineItemIndex: number, burstIndex: number) => void
  onRemoveBurst: (lineItemIndex: number, burstIndex: number) => void
}) {
  const buyType = useWatch({
    control: form.control,
    name: fieldName<T>(itemsKey, lineItemIndex, "buyType"),
  }) as string | undefined
  const budgetIncludesFees = useWatch({
    control: form.control,
    name: fieldName<T>(itemsKey, lineItemIndex, "budgetIncludesFees"),
  }) as boolean | undefined
  const bursts =
    (useWatch({
      control: form.control,
      name: fieldName<T>(itemsKey, lineItemIndex, "bursts"),
    }) as unknown[] | undefined) ?? []

  const bonusLocked = buyType === "bonus" || buyType === "package_inclusions"
  const calculatedLabel = getCpcFamilyBurstCalculatedColumnLabel(
    calculatedVariant,
    buyType || ""
  )

  return (
    <div className={MP_BURST_SECTION_OUTER}>
      <div className={MP_BURST_HEADER_SHELL}>
        <div className={MP_BURST_HEADER_INNER}>
          <div className={MP_BURST_LABEL_COLUMN} aria-hidden />
          <div className={MP_BURST_HEADER_ROW}>
            <div
              className={`${MP_BURST_GRID_7} text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}
            >
              <span>Budget</span>
              <span>Buy Amount</span>
              <span>Start</span>
              <span>End</span>
              <span>{calculatedLabel}</span>
              <span>Media</span>
              <span>{`Fee (${feePct}%)`}</span>
            </div>
            <div className={MP_BURST_ACTION_COLUMN}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </span>
            </div>
          </div>
        </div>
      </div>

      {bursts.map((burstField, burstIndex) => {
        const burstKey =
          (burstField as { _reactKey?: string } | null)?._reactKey ??
          `${lineItemIndex}-${burstIndex}`
        const budgetRaw = parseBudgetRaw(
          form.getValues(burstFieldName<T>(itemsKey, lineItemIndex, burstIndex, "budget"))
        )
        const mediaValue = budgetIncludesFees
          ? (budgetRaw / 100) * (100 - feePct)
          : budgetRaw
        const feeValue = budgetIncludesFees
          ? (budgetRaw / 100) * feePct
          : feePct === 100
            ? 0
            : (budgetRaw / (100 - feePct)) * feePct

        return (
          <Card key={burstKey} className={MP_BURST_CARD}>
            <CardContent className={MP_BURST_CARD_CONTENT}>
              <div className={MP_BURST_ROW_SHELL}>
                <div className={MP_BURST_LABEL_COLUMN}>
                  <h4 className={MP_BURST_LABEL_HEADING}>
                    {formatBurstLabel(
                      burstIndex + 1,
                      form.watch(
                        burstFieldName<T>(itemsKey, lineItemIndex, burstIndex, "startDate")
                      ) as Date | undefined,
                      form.watch(
                        burstFieldName<T>(itemsKey, lineItemIndex, burstIndex, "endDate")
                      ) as Date | undefined
                    )}
                  </h4>
                </div>

                <div className={MP_BURST_GRID_7}>
                  <FormField
                    control={form.control}
                    name={burstFieldName<T>(itemsKey, lineItemIndex, burstIndex, "budget")}
                    render={({ field }) => (
                      <FormItem className="flex flex-col justify-end space-y-0">
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            className="h-10 w-full min-w-[9rem] text-sm"
                            value={bonusLocked ? "0" : field.value}
                            disabled={bonusLocked}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.]/g, "")
                              field.onChange(value)
                              onBurstValueChange(lineItemIndex, burstIndex)
                            }}
                            onBlur={(e) => {
                              const formattedValue = formatMoney(
                                parseMoneyInput(e.target.value) ?? 0,
                                { locale: "en-AU", currency: "AUD" }
                              )
                              field.onChange(formattedValue)
                              onBurstValueChange(lineItemIndex, burstIndex)
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={burstFieldName<T>(
                      itemsKey,
                      lineItemIndex,
                      burstIndex,
                      "buyAmount"
                    )}
                    render={({ field }) => (
                      <FormItem className="flex flex-col justify-end space-y-0">
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            className="h-10 w-full min-w-[9rem] text-sm"
                            value={bonusLocked ? "0" : field.value}
                            disabled={bonusLocked}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.]/g, "")
                              field.onChange(value)
                              onBurstValueChange(lineItemIndex, burstIndex)
                            }}
                            onBlur={(e) => {
                              const formattedValue = formatMoney(
                                parseMoneyInput(e.target.value) ?? 0,
                                { locale: "en-AU", currency: "AUD" }
                              )
                              field.onChange(formattedValue)
                              onBurstValueChange(lineItemIndex, burstIndex)
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={burstFieldName<T>(
                      itemsKey,
                      lineItemIndex,
                      burstIndex,
                      "startDate"
                    )}
                    render={({ field }) => (
                      <FormItem className="flex flex-col justify-end space-y-0">
                        <FormControl>
                          <SingleDatePicker
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={field.value}
                            onChange={field.onChange}
                            className="h-10 w-full pl-2 text-left text-sm font-normal"
                            calendarContext="media-burst"
                            mediaBurstRole="start"
                            campaignStartDate={campaignStartDate}
                            campaignEndDate={campaignEndDate}
                            isDateDisabled={(date) => date > new Date("2100-01-01")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={burstFieldName<T>(itemsKey, lineItemIndex, burstIndex, "endDate")}
                    render={({ field }) => (
                      <FormItem className="flex flex-col justify-end space-y-0">
                        <FormControl>
                          <SingleDatePicker
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={field.value}
                            onChange={field.onChange}
                            className="h-10 w-full pl-2 text-left text-sm font-normal"
                            calendarContext="media-burst"
                            mediaBurstRole="end"
                            campaignStartDate={campaignStartDate}
                            campaignEndDate={campaignEndDate}
                            isDateDisabled={(date) => date > new Date("2100-01-01")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={burstFieldName<T>(
                      itemsKey,
                      lineItemIndex,
                      burstIndex,
                      "calculatedValue"
                    )}
                    render={({ field }) => (
                      <CpcFamilyBurstCalculatedField
                        form={form}
                        itemsKey={itemsKey}
                        lineItemIndex={lineItemIndex}
                        burstIndex={burstIndex}
                        field={field}
                        feePct={feePct}
                        variant={calculatedVariant}
                      />
                    )}
                  />

                  <Input
                    type="text"
                    readOnly
                    className="h-10 w-full border-border/40 bg-muted/30 text-sm text-muted-foreground"
                    value={formatMoney(mediaValue, {
                      locale: "en-AU",
                      currency: "AUD",
                    })}
                  />
                  <Input
                    type="text"
                    readOnly
                    className="h-10 w-full border-border/40 bg-muted/30 text-sm text-muted-foreground"
                    value={formatMoney(feeValue, {
                      locale: "en-AU",
                      currency: "AUD",
                    })}
                  />
                </div>

                <div className={MP_BURST_ACTION_COLUMN}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onAppendBurst(lineItemIndex)}
                    title="Add burst"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onDuplicateBurst(lineItemIndex, burstIndex)}
                    title="Duplicate burst"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onRemoveBurst(lineItemIndex, burstIndex)}
                    title="Remove burst"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/**
 * Generic expert-mode line-item card driven by channel descriptor config:
 * header (option chips + total), 5-col body (small fields left / primary text right),
 * and shared bursts + media/fee cells.
 */
export function ExpertCard<T extends FieldValues>({
  config,
  form,
  itemsKey,
  lineItemIndex,
  lineItemId,
  collapsed = false,
  onToggleCollapsed,
  totalDisplay,
  publishers,
  stationOptions = [],
  dynamicOptionsByKey = {},
  feePct,
  calculatedVariant = "cpcCpvCpm",
  campaignStartDate,
  campaignEndDate,
  onBurstValueChange,
  onAppendBurst,
  onDuplicateBurst,
  onRemoveBurst,
  onBudgetIncludesFeesChange,
  onComboboxValueChange,
  onFieldValueChange,
  fieldAdornments,
  comboboxPropsByKey,
  burstsSlot,
  summaryRow,
  footer,
  className,
}: ExpertCardProps<T>) {
  const cardFields = getExpertCardSurfaceFields(config)
  const optionFlags = getExpertOptionFlags(config)
  const dropdownFields = cardFields.filter((d) =>
    isComboboxDescriptorKind(d.kind)
  )
  const textFields = cardFields.filter((d) => d.kind === "text")
  const primaryTextField = resolveExpertCardPrimaryTextField(textFields)
  const compactTextFields = textFields.filter(
    (d) => d.key !== primaryTextField?.key
  )
  const otherFields = cardFields.filter(
    (d) => !isComboboxDescriptorKind(d.kind) && d.kind !== "text"
  )

  const renderFieldControl = (
    d: ExpertDescriptorColumn,
    fieldLayout: ExpertCardFieldLayout = "default"
  ) => (
    <ExpertCardFieldControl
      d={d}
      form={form}
      itemsKey={itemsKey}
      lineItemIndex={lineItemIndex}
      publishers={publishers}
      stationOptions={stationOptions}
      dynamicOptionsByKey={dynamicOptionsByKey}
      campaignStartDate={campaignStartDate}
      campaignEndDate={campaignEndDate}
      onComboboxValueChange={onComboboxValueChange}
      onFieldValueChange={onFieldValueChange}
      fieldAdornment={fieldAdornments?.[d.key]}
      comboboxProps={comboboxPropsByKey?.[d.key]}
      fieldLayout={fieldLayout}
    />
  )

  return (
    <Card
      className={cn(
        "space-y-3 overflow-hidden border border-border/50 shadow-sm transition-shadow duration-200 hover:shadow-md",
        className
      )}
    >
      <CardHeader className="bg-muted/30 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {lineItemIndex + 1}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold tracking-tight">
                {config.channelLabel} Line Item
              </CardTitle>
              <span className="font-mono text-[11px] text-muted-foreground">
                {lineItemId}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            {optionFlags.length > 0 ? (
              <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
                {optionFlags.map((flag) => (
                  <FormField
                    key={flag.key}
                    control={form.control}
                    name={fieldName<T>(itemsKey, lineItemIndex, flag.key)}
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-1.5 space-y-0">
                        <FormControl>
                          <Checkbox
                            className="h-3.5 w-3.5"
                            checked={!!field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked)
                              if (
                                flag.key === "budgetIncludesFees" &&
                                onBudgetIncludesFeesChange
                              ) {
                                onBudgetIncludesFeesChange(
                                  lineItemIndex,
                                  !!checked
                                )
                              }
                            }}
                          />
                        </FormControl>
                        <FormLabel className="cursor-pointer whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">
                          {flag.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            ) : null}
            <div className="text-right">
              <span className="block text-[11px] text-muted-foreground">Total</span>
              <span className="num text-sm font-bold">{totalDisplay}</span>
            </div>
            {onToggleCollapsed ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-full p-0"
                aria-expanded={!collapsed}
                aria-label={
                  collapsed
                    ? `Expand details for ${config.channelLabel.toLowerCase()} line item ${lineItemIndex + 1}`
                    : `Collapse details for ${config.channelLabel.toLowerCase()} line item ${lineItemIndex + 1}`
                }
                onClick={onToggleCollapsed}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    collapsed && "-rotate-90"
                  )}
                  aria-hidden
                />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      {summaryRow}

      {!collapsed ? (
        <>
          <div className="px-6 py-3">
            <CardContent className="p-0">
              {cardFields.length > 0 ? (
                <div className="grid grid-cols-1 gap-x-3 gap-y-3 lg:grid-cols-5">
                  {/* LEFT: dropdowns + small text, 3 across */}
                  <div className="grid grid-cols-2 content-start gap-x-3 gap-y-3 sm:grid-cols-3 lg:col-span-3">
                    {dropdownFields.map((d) => (
                      <div key={d.key} className="min-w-0">
                        {renderFieldControl(d, "combobox")}
                      </div>
                    ))}
                    {otherFields.map((d) => (
                      <div key={d.key} className="min-w-0">
                        {renderFieldControl(d)}
                      </div>
                    ))}
                    {compactTextFields.map((d) => (
                      <div key={d.key} className="min-w-0">
                        {renderFieldControl(d, "compact-text")}
                      </div>
                    ))}
                  </div>
                  {/* RIGHT: the one free-text box, fills 2 columns + full height */}
                  {primaryTextField ? (
                    <div
                      key={primaryTextField.key}
                      className="flex min-h-[7rem] flex-col lg:col-span-2"
                    >
                      {renderFieldControl(primaryTextField, "primary-text")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </div>

          {burstsSlot != null ? (
            burstsSlot
          ) : (
            <ExpertCardBursts
              form={form}
              itemsKey={itemsKey}
              lineItemIndex={lineItemIndex}
              feePct={feePct}
              calculatedVariant={calculatedVariant}
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
              onBurstValueChange={onBurstValueChange}
              onAppendBurst={onAppendBurst}
              onDuplicateBurst={onDuplicateBurst}
              onRemoveBurst={onRemoveBurst}
            />
          )}
        </>
      ) : null}

      {footer ? (
        <CardFooter className="flex items-center justify-between border-t border-border/40 bg-muted/20 pb-4 pt-4">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  )
}
