"use client"

import { Copy, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { composeName } from "@/lib/naming/compose"
import { PICKLISTS } from "@/lib/naming/templates"
import type { NamingTemplate, TemplateElement } from "@/lib/naming/types"
import { validateValue } from "@/lib/naming/validate"
import { cn } from "@/lib/utils"

export type NamingGridRow = {
  id: string
  isBase: boolean
  excluded: boolean
  values: Record<string, string>
}

type NamingLevelGridProps = {
  template: NamingTemplate
  rows: NamingGridRow[]
  /** Composite plan fields resolved live (campaign_name / io_name). */
  resolveComposites: (values: Record<string, string>) => Record<string, string>
  sizeSelection: string[]
  onSizeSelectionChange: (sizes: string[]) => void
  onExpandSizes: () => void
  onChangeValue: (rowId: string, key: string, value: string) => void
  onDuplicate: (rowId: string) => void
  onDelete: (rowId: string) => void
  onToggleExcluded: (rowId: string, excluded: boolean) => void
}

/** Plan fields buyers personalise in the builder (still sourced from plan when seeded). */
const EDITABLE_PLAN_KEYS = new Set(["targeting", "creative_name"])

function isEditableElement(el: TemplateElement): boolean {
  if (el.source === "literal") return false
  if (el.source === "picklist" || el.source === "free") return true
  if (el.source === "plan" && EDITABLE_PLAN_KEYS.has(el.key)) return true
  return false
}

function isReadOnlyPlan(el: TemplateElement): boolean {
  return el.source === "plan" && !EDITABLE_PLAN_KEYS.has(el.key)
}

function elementLabel(el: TemplateElement): string {
  if (el.source === "literal") return el.literal ?? el.key
  return el.key.replace(/_/g, " ")
}

function liveCompose(
  template: NamingTemplate,
  values: Record<string, string>,
): { name: string | null; error?: string } {
  for (const el of template.elements) {
    if (el.source === "literal") continue
    const raw = values[el.key] ?? ""
    if (!raw.trim()) {
      if (el.optional) continue
      return { name: null, error: `Missing ${el.key}` }
    }
    const check = validateValue(el, raw)
    if (!check.ok) return { name: null, error: check.message }
  }
  try {
    return { name: composeName(template, values) }
  } catch (err) {
    return {
      name: null,
      error: err instanceof Error ? err.message : "Compose failed",
    }
  }
}

function CellEditor({
  element,
  value,
  onChange,
  disabled,
}: {
  element: TemplateElement
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  if (element.source === "literal") {
    return (
      <span className="font-mono text-xs text-muted-foreground">{element.literal}</span>
    )
  }

  if (isReadOnlyPlan(element)) {
    return (
      <div className="flex min-w-[7rem] items-center gap-1.5">
        <span className="num truncate text-sm">{value || "—"}</span>
        <Badge variant="secondary" size="sm">
          plan
        </Badge>
      </div>
    )
  }

  if (element.source === "picklist" && element.picklist) {
    const options = PICKLISTS[element.picklist] ?? []
    return (
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 min-w-[8rem]">
          <SelectValue placeholder={`Select ${element.key}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // free or editable plan (targeting / creative_name)
  const check = validateValue(element, value)
  const showError = value.trim() !== "" && !check.ok
  return (
    <div className="min-w-[8rem] space-y-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "h-8 font-mono text-xs",
          showError && "border-status-critical-fg focus-visible:ring-status-critical-fg",
        )}
        aria-invalid={showError}
      />
      {showError ? (
        <p className="text-xs text-status-critical-fg">{check.message}</p>
      ) : null}
    </div>
  )
}

export function NamingLevelGrid({
  template,
  rows,
  resolveComposites,
  sizeSelection,
  onSizeSelectionChange,
  onExpandSizes,
  onChangeValue,
  onDuplicate,
  onDelete,
  onToggleExcluded,
}: NamingLevelGridProps) {
  const hasSize = template.elements.some((el) => el.key === "size")
  const sizeOptions = PICKLISTS.iab_sizes

  const visibleElements = template.elements.filter((el) => el.source !== "literal")

  return (
    <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold capitalize text-foreground">
            {template.level.replace(/_/g, " ")}
            {template.isPacingGrain ? (
              <Badge variant="outline" size="sm" className="ml-2 align-middle">
                pacing grain
              </Badge>
            ) : null}
          </h3>
          <p className="text-xs text-muted-foreground">
            {template.elements.map((el) => el.key).join(" · ")}
          </p>
        </div>

        {hasSize ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex max-w-md flex-wrap gap-2">
              {sizeOptions.map((size) => {
                const checked = sizeSelection.includes(size)
                return (
                  <label
                    key={size}
                    className="interactive-tint flex cursor-pointer items-center gap-1.5 rounded-input border border-border px-2 py-1 text-xs"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        const on = next === true
                        onSizeSelectionChange(
                          on
                            ? [...sizeSelection, size]
                            : sizeSelection.filter((s) => s !== size),
                        )
                      }}
                    />
                    <span className="num">{size}</span>
                  </label>
                )
              })}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sizeSelection.length === 0}
              onClick={onExpandSizes}
            >
              Expand
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Include</TableHead>
              {visibleElements.map((el) => (
                <TableHead key={el.key} className="capitalize">
                  {elementLabel(el)}
                  {isReadOnlyPlan(el) ? (
                    <span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground">
                      plan
                    </span>
                  ) : null}
                </TableHead>
              ))}
              <TableHead>Composed name</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleElements.length + 3}
                  className="text-center text-sm text-muted-foreground"
                >
                  No rows at this level.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const merged = {
                  ...row.values,
                  ...resolveComposites(row.values),
                }
                // Attach literals for compose
                for (const el of template.elements) {
                  if (el.source === "literal" && el.literal) {
                    merged[el.key] = el.literal
                  }
                }
                const composed = row.excluded
                  ? { name: null as string | null, error: "Excluded" }
                  : liveCompose(template, merged)

                return (
                  <TableRow
                    key={row.id}
                    className={cn(row.excluded && "opacity-50")}
                  >
                    <TableCell>
                      {row.isBase ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!row.excluded}
                            onCheckedChange={(on) => onToggleExcluded(row.id, !on)}
                            aria-label={row.excluded ? "Include row" : "Exclude row"}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">added</span>
                      )}
                    </TableCell>
                    {visibleElements.map((el) => (
                      <TableCell key={el.key}>
                        <CellEditor
                          element={el}
                          value={
                            el.key === "campaign_name" || el.key === "io_name"
                              ? merged[el.key] ?? ""
                              : row.values[el.key] ?? ""
                          }
                          disabled={row.excluded || !isEditableElement(el)}
                          onChange={(next) => onChangeValue(row.id, el.key, next)}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      {composed.name ? (
                        <code className="num block max-w-xs truncate font-mono text-xs text-foreground">
                          {composed.name}
                        </code>
                      ) : (
                        <span className="text-xs text-status-critical-fg">
                          {composed.error ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Duplicate row"
                          onClick={() => onDuplicate(row.id)}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        {!row.isBase ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-status-critical-fg"
                            title="Delete row"
                            onClick={() => onDelete(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
