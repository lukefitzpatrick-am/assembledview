"use client"

import { FilterX, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox"
import type { DashboardViewFilters } from "@/lib/dashboard/homeDashboardFilters"

export type DashboardFilterBarProps = {
  filters: DashboardViewFilters
  onFiltersChange: (next: DashboardViewFilters) => void
  clientFilterOptions: readonly MultiSelectOption[]
  savedViews: readonly unknown[]
  savedViewsListKey: string | null | undefined
  savedViewJustSaved: boolean
  onSaveSelectedClients: () => void
  onClearAllSavedViews: () => void
  onClearFilters: () => void
}

export function DashboardFilterBar({
  filters,
  onFiltersChange,
  clientFilterOptions,
  savedViews,
  savedViewsListKey,
  savedViewJustSaved,
  onSaveSelectedClients,
  onClearAllSavedViews,
  onClearFilters,
}: DashboardFilterBarProps) {
  const clearDisabled =
    !filters.campaignSearch.trim() &&
    filters.clients.length === 0 &&
    filters.publishers.length === 0 &&
    !filters.month

  return (
    <div className="w-full rounded-frame border border-border bg-background p-3 md:p-4">
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-[260px]">
          <Label htmlFor="dashboard-campaign-search" className="sr-only">
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="dashboard-campaign-search"
              value={filters.campaignSearch}
              onChange={(e) => onFiltersChange({ ...filters, campaignSearch: e.target.value })}
              placeholder="Search campaigns..."
              className="h-9 border-border bg-surface-panel pl-10 transition-colors focus:bg-background"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 basis-[260px]">
          <Label className="sr-only">Clients</Label>
          <MultiSelectCombobox
            options={clientFilterOptions}
            values={filters.clients}
            onValuesChange={(v) => onFiltersChange({ ...filters, clients: v })}
            placeholder="All clients"
            allSelectedText="All clients"
            selectAllText="Select all"
            clearAllText="Clear all"
            searchPlaceholder="Filter clients..."
            emptyText="No clients found."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-9 whitespace-nowrap text-xs"
            onClick={onSaveSelectedClients}
            disabled={!savedViewsListKey}
            title={!savedViewsListKey ? "Sign in to save selected clients" : undefined}
          >
            {savedViewJustSaved ? "Saved" : "Save selected clients"}
          </Button>
          {savedViews.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 whitespace-nowrap"
              onClick={onClearAllSavedViews}
              disabled={!savedViewsListKey}
            >
              Clear all saved
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-9 whitespace-nowrap text-xs"
            onClick={onClearFilters}
            disabled={clearDisabled}
          >
            <FilterX className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            Clear filters
          </Button>
        </div>
      </div>
    </div>
  )
}
