"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { coalescedGetJson } from "@/lib/api/coalescedGetJson"
import { fyDisplayLabel, fySelectOptions } from "@/lib/finance/months"
import { useFinanceScopeStore } from "@/lib/finance/sections/useFinanceScope"
import { cn } from "@/lib/utils"

type ClientRow = { id: number; mp_client_name: string }

/**
 * Shared scope bar — one instance under the sections shell.
 * Apply commits draft → applied + URL; no Load/Loaded/Refresh relabelling.
 *
 * `variant="fy-only"` hides month range + clients (Forecasting — FY-native).
 * Month controls are omitted entirely (not disabled) to avoid confusing chrome.
 */
export function SectionScopeBar({
  showingLabel,
  className,
  variant = "default",
}: {
  /** Optional "showing X of Y" slot content. */
  showingLabel?: string
  className?: string
  variant?: "default" | "fy-only"
}) {
  const fyOnly = variant === "fy-only"
  const router = useRouter()
  const pathname = usePathname() ?? "/finance"
  const searchParams = useSearchParams()
  const draft = useFinanceScopeStore((s) => s.draft)
  const setDraftFy = useFinanceScopeStore((s) => s.setDraftFy)
  const setDraftMonthRange = useFinanceScopeStore((s) => s.setDraftMonthRange)
  const setDraft = useFinanceScopeStore((s) => s.setDraft)
  const apply = useFinanceScopeStore((s) => s.apply)
  const reset = useFinanceScopeStore((s) => s.reset)
  const hydrateFromUrl = useFinanceScopeStore((s) => s.hydrateFromUrl)
  const toSearchParams = useFinanceScopeStore((s) => s.toSearchParams)
  const dirty = useFinanceScopeStore((s) => s.isDirty())

  const [clients, setClients] = useState<ClientRow[]>([])

  useEffect(() => {
    hydrateFromUrl(new URLSearchParams(searchParams?.toString() ?? ""))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per mount / URL entry
  }, [])

  useEffect(() => {
    let cancelled = false
    void coalescedGetJson<ClientRow[]>("/api/clients")
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setClients(data)
      })
      .catch(() => {
        if (!cancelled) setClients([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fyOptions = useMemo(() => fySelectOptions(), [])
  const clientOptions = useMemo(
    () =>
      clients
        .map((c) => ({
          value: String(c.id),
          label: c.mp_client_name?.trim() || `Client ${c.id}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [clients]
  )

  /** Merge scope params without dropping section-local keys (e.g. `fmode`). */
  const replaceUrlWithScope = (scopeParams: URLSearchParams) => {
    const next = new URLSearchParams(scopeParams.toString())
    const current = new URLSearchParams(searchParams?.toString() ?? "")
    const fmode = current.get("fmode")
    if (fmode === "target" || fmode === "variance") next.set("fmode", fmode)
    const qs = next.toString()
    // Deliberate replace, not push: scope is a view filter, not a place in history.
    // Back should leave the section, not undo Apply. A history entry per Apply would
    // stack filters and fight the Apply-gate (draft commits only on Apply).
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const commitApply = () => {
    apply()
    replaceUrlWithScope(toSearchParams())
  }

  const commitReset = () => {
    reset()
    replaceUrlWithScope(toSearchParams())
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Financial year
          </Label>
          <Select
            value={String(draft.fy)}
            onValueChange={(v) => setDraftFy(Number.parseInt(v, 10))}
          >
            <SelectTrigger className="w-[140px]" aria-label="Financial year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map((fy) => (
                <SelectItem key={fy} value={String(fy)}>
                  FY{fyDisplayLabel(fy)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!fyOnly ? (
          <>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Month from
              </Label>
              <input
                type="month"
                className="flex h-9 w-[150px] rounded-input border border-input bg-background px-2 text-sm"
                value={draft.monthRange.from}
                onChange={(e) =>
                  setDraftMonthRange({ from: e.target.value, to: draft.monthRange.to })
                }
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Month to
              </Label>
              <input
                type="month"
                className="flex h-9 w-[150px] rounded-input border border-input bg-background px-2 text-sm"
                value={draft.monthRange.to}
                onChange={(e) =>
                  setDraftMonthRange({ from: draft.monthRange.from, to: e.target.value })
                }
              />
            </div>

            <div className="min-w-[200px] flex-1 space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Clients
              </Label>
              <MultiSelectCombobox
                options={clientOptions}
                values={draft.clients.map(String)}
                onValuesChange={(values) =>
                  setDraft({
                    clients: values
                      .map((v) => Number.parseInt(v, 10))
                      .filter((n) => Number.isFinite(n)),
                  })
                }
                placeholder="All clients"
                allSelectedText="All clients"
                emptyMeansAll
                selectAllText="All clients"
                clearAllText="Clear"
              />
            </div>
          </>
        ) : null}

        <div className="flex items-center gap-2 pb-0.5">
          <Button type="button" size="sm" onClick={commitApply}>
            Apply
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={commitReset}>
            Reset
          </Button>
        </div>
      </div>

      {showingLabel ? (
        <p className="text-xs text-muted-foreground">{showingLabel}</p>
      ) : fyOnly ? (
        <p className="text-xs text-muted-foreground">
          Scope: FY{fyDisplayLabel(draft.fy)} (forecast is financial-year native)
          {dirty ? " · unsaved changes" : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Scope: FY{fyDisplayLabel(draft.fy)} · {draft.monthRange.from} → {draft.monthRange.to}
          {draft.clients.length ? ` · ${draft.clients.length} client(s)` : " · all clients"}
          {dirty ? " · unsaved changes" : ""}
        </p>
      )}
    </div>
  )
}
