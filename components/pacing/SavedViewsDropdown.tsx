"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { fetchPacingSavedViews } from "@/lib/xano/pacing-client"
import type { PacingSavedView } from "@/lib/xano/pacing-types"
import { ALL_MY_CLIENTS_VALUE, parseFiltersSnapshot } from "@/lib/pacing/pacingFilters"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

export function SavedViewsDropdown() {
  const filters = usePacingFilterStore((s) => s.filters)
  const setFilters = usePacingFilterStore((s) => s.setFilters)
  const applySnapshot = usePacingFilterStore((s) => s.applySnapshot)

  const [views, setViews] = useState<PacingSavedView[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetchPacingSavedViews()
      setViews(Array.isArray(res.data) ? res.data : [])
    } catch {
      setViews([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const currentValue = filters.savedViewId ?? ALL_MY_CLIENTS_VALUE

  const triggerLabel = (() => {
    if (filters.savedViewId) {
      const v = views.find((x) => String(x.id) === filters.savedViewId)
      return v?.name ? v.name : "Saved view"
    }
    return "All my clients"
  })()

  const onAllMyClients = () => {
    setFilters({ client_ids: [], savedViewId: null })
    setOpen(false)
  }

  const onPickView = (v: PacingSavedView) => {
    const snap = parseFiltersSnapshot(v.filters_json)
    if (snap) {
      applySnapshot(snap, String(v.id))
    } else {
      applySnapshot(
        {
          client_ids: [],
          media_types: [],
          statuses: [],
          date_from: filters.date_from,
          date_to: filters.date_to,
          search: "",
        },
        String(v.id)
      )
    }
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-[10rem] justify-between gap-2">
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2"
          onSelect={(e) => {
            e.preventDefault()
            onAllMyClients()
          }}
        >
          <span className="flex flex-1 items-center gap-2">
            {currentValue === ALL_MY_CLIENTS_VALUE ? (
              <Check className="h-4 w-4 shrink-0 opacity-70" />
            ) : (
              <span className="inline-block w-4" />
            )}
            All my clients
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {views.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet</div>
        ) : (
          views.map((v) => (
            <DropdownMenuItem
              key={v.id}
              className="gap-2"
              onSelect={(e) => {
                e.preventDefault()
                onPickView(v)
              }}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {String(v.id) === filters.savedViewId ? (
                  <Check className="h-4 w-4 shrink-0 opacity-70" />
                ) : (
                  <span className="inline-block w-4" />
                )}
                <span className="truncate">{v.name}</span>
              </span>
              {v.is_default ? (
                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Default view" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs text-muted-foreground focus:text-foreground"
          onSelect={(e) => {
            e.preventDefault()
            void load()
          }}
        >
          Refresh list
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
