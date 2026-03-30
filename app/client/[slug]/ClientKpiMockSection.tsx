'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { Publisher } from '@/lib/types/publisher'
import {
  KPI_FAMILY_LABELS,
  KPI_FAMILY_PUB_FLAG,
  KPI_METRIC_KEYS,
} from '@/lib/publisher/scheduleLabels'

type Row = {
  publisher: Publisher
  requirements: string
}

/** Local mock only — replace with Xano (or your KPI store) when the table/endpoint is ready. */
export function ClientKpiMockSection({ urlSlug }: { urlSlug: string }) {
  const storageKey = `clientHubKpiMock:${urlSlug}`
  const [rows, setRows] = useState<Row[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickId, setPickId] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Row[]
      if (Array.isArray(parsed)) setRows(parsed)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  useEffect(() => {
    if (!pickerOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/publishers')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data)) setPublishers(data)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pickerOpen])

  const options = useMemo(
    () =>
      publishers.map((p) => ({
        value: String(p.id),
        label: p.publisher_name || `Publisher ${p.id}`,
      })),
    [publishers]
  )

  function persist(next: Row[]) {
    setRows(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function addPublisher() {
    const id = Number(pickId)
    if (!Number.isFinite(id)) return
    const pub = publishers.find((p) => p.id === id)
    if (!pub) return
    if (rows.some((r) => r.publisher.id === id)) {
      setPickerOpen(false)
      setPickId('')
      return
    }
    persist([...rows, { publisher: pub, requirements: '' }])
    setPickerOpen(false)
    setPickId('')
  }

  function updateRequirements(id: number, requirements: string) {
    persist(rows.map((r) => (r.publisher.id === id ? { ...r, requirements } : r)))
  }

  function removeRow(id: number) {
    persist(rows.filter((r) => r.publisher.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Add publishers to preview default KPIs and note requirements. Saving to the database is not wired yet.
        </p>
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Plus className="mr-1 h-4 w-4" />
              Add publisher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add publisher</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Combobox
                value={pickId}
                onValueChange={setPickId}
                placeholder="Select publisher"
                searchPlaceholder="Search publishers..."
                emptyText="No publishers found."
                options={options}
              />
              <Button type="button" className="w-full" disabled={!pickId} onClick={addPublisher}>
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No publishers added yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ publisher, requirements }) => {
            const visibleFamilies = Object.entries(KPI_FAMILY_PUB_FLAG).filter(
              ([, flag]) => publisher[flag as keyof Publisher]
            )
            return (
              <Card key={publisher.id} className="rounded-2xl border-muted/70">
                <CardHeader className="border-b border-muted/40 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{publisher.publisher_name}</CardTitle>
                      <CardDescription className="text-xs">
                        KPI defaults (read-only preview from publisher record)
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeRow(publisher.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {visibleFamilies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No digital / social / programmatic KPI families enabled on this publisher.
                    </p>
                  ) : (
                    visibleFamilies.map(([family]) => {
                      const label = KPI_FAMILY_LABELS[family] ?? family
                      return (
                        <div key={family} className="space-y-2 rounded-lg border border-border/60 p-3">
                          <h4 className="text-sm font-semibold">{label}</h4>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                            {KPI_METRIC_KEYS.map((metric) => {
                              const key = `${family}_${metric}_default` as keyof Publisher
                              const val = publisher[key]
                              const n = typeof val === 'number' ? val : Number(val)
                              return (
                                <div key={metric} className="text-xs">
                                  <div className="font-medium uppercase text-muted-foreground">{metric}</div>
                                  <div className="tabular-nums">{Number.isFinite(n) ? n : 0}</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`req-${publisher.id}`}>Requirements / notes</Label>
                    <Textarea
                      id={`req-${publisher.id}`}
                      value={requirements}
                      onChange={(e) => updateRequirements(publisher.id, e.target.value)}
                      placeholder="e.g. reporting cadence, creative specs…"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Button type="button" variant="secondary" disabled className="w-full sm:w-auto">
        Save (connect KPI database)
      </Button>
    </div>
  )
}
