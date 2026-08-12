"use client"

import { Suspense, useCallback, useEffect, useMemo, useState, Fragment } from "react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LoadingState } from "@/components/ui/states"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import { resolveListViewState } from "@/lib/ui/viewState"

type ApiPayload = {
  profiles: PublisherProfileConfig[]
  source: "postgres" | "seed"
  editable: boolean
}

function PublisherProfilesPageInner() {
  const pageLabel =
    getRouteByExactPath("/admin/publisher-profiles")?.label ??
    "Publisher profiles"
  const [data, setData] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const retry = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch("/api/admin/publisher-profiles")
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(body?.error || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as ApiPayload
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) {
          setData(null)
          setError(e instanceof Error ? e.message : "Failed to load")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const profiles = data?.profiles ?? []
  const viewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items: profiles,
        visible: profiles,
        filtersActive: false,
        clear: () => {},
        retry,
      }),
    [error, loading, profiles, retry],
  )

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {pageLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          Read-only ingest configuration. Mapping is row data (
          <span className="font-medium text-foreground">publisher_profiles</span>
          ), not TypeScript. Edit via SQL / a later CMS — a new publisher is an
          INSERT, not a deploy.
          {data ? (
            <>
              {" "}
              Source: <Badge variant="outline">{data.source}</Badge>
            </>
          ) : null}
        </p>
      </header>

      <ViewStateBoundary
        state={viewState}
        loadingRows={8}
        emptyTitle="No publisher profiles"
        emptyMessage="Apply migration 0024 or ensure the seed JSON is present."
        errorTitle="Could not load profiles"
      >
        {(rows) => (
          <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Publisher</TableHead>
                  <TableHead>Media type</TableHead>
                  <TableHead>Grid semantics</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Columns mapped</TableHead>
                  <TableHead>Legend keys</TableHead>
                  <TableHead>Sheet rules</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const open = expanded === p.publisher_name
                  return (
                    <Fragment key={p.publisher_name}>
                      <TableRow
                        className="interactive-row cursor-pointer"
                        onClick={() =>
                          setExpanded(open ? null : p.publisher_name)
                        }
                      >
                        <TableCell className="font-medium">
                          {p.publisher_name}
                        </TableCell>
                        <TableCell>{p.media_type}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.grid_semantics === "status_matrix"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {p.grid_semantics}
                          </Badge>
                        </TableCell>
                        <TableCell>{p.active ? "Yes" : "No"}</TableCell>
                        <TableCell className="num">
                          {Object.keys(p.column_map).length}
                        </TableCell>
                        <TableCell className="num">
                          {Object.keys(p.legend_map).length}
                        </TableCell>
                        <TableCell className="num">
                          {p.sheet_rules.length}
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30">
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-input border border-border bg-background p-3 text-xs text-muted-foreground">
                              {JSON.stringify(
                                {
                                  detect_signature: p.detect_signature,
                                  column_map: p.column_map,
                                  legend_map: p.legend_map,
                                  sheet_rules: p.sheet_rules,
                                  notes: p.notes,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </ViewStateBoundary>
    </div>
  )
}

export default function PublisherProfilesAdminPage() {
  return (
    <AdminGuard>
      <Suspense fallback={<LoadingState rows={6} />}>
        <PublisherProfilesPageInner />
      </Suspense>
    </AdminGuard>
  )
}
