"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Layers } from "lucide-react"
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/components/layout/Panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { AVA_MAPPING_TARGET_DESCRIPTORS } from "@/lib/mediaplans/ingest/avaColumnMapping"
import { MONEY_TARGETS } from "@/lib/mediaplans/ingest/moneyTargets"
import { REFERENCE_IGNORE_TARGET, FIXED_VALUE_COLUMN_LABEL, constantMappingHeader, isConstantMappingHeader } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import type { IngestRunRecord } from "@/lib/mediaplans/ingest/ingestRuns"
import type { Publisher } from "@/lib/types/publisher"

const PLAN_FIELDS = [
  ...AVA_MAPPING_TARGET_DESCRIPTORS,
  ...MONEY_TARGETS,
  REFERENCE_IGNORE_TARGET,
]

type HubPayload = {
  profile: PublisherProfileConfig | null
  runs: IngestRunRecord[]
}

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${Math.round(n * 100)}%`
}

export function PublisherIngestSection({ publisher }: { publisher: Publisher }) {
  const [data, setData] = useState<HubPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [remapping, setRemapping] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/publishers/${encodeURIComponent(String(publisher.publisherid).trim())}/ingest`,
      )
      if (res.status === 403) {
        setData(null)
        setError(null)
        setLoading(false)
        return
      }
      const json = (await res.json()) as HubPayload & { error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : "Failed to load ingest profile")
    } finally {
      setLoading(false)
    }
  }, [publisher.publisherid])

  useEffect(() => {
    void load()
  }, [load])

  const mappingRows = useMemo(() => {
    const profile = data?.profile
    if (!profile) return []
    const columns = Object.entries(profile.column_map)
      .map(([header, dest]) => ({ header, dest, kind: "column" as const }))
    const constants = Object.entries(profile.field_defaults ?? {}).map(
      ([fieldId, value]) => ({
        header: constantMappingHeader(fieldId),
        dest: fieldId,
        kind: "constant" as const,
        value,
      }),
    )
    return [...constants, ...columns].sort(
      (a, b) => a.dest.localeCompare(b.dest) || a.header.localeCompare(b.header),
    )
  }, [data?.profile])

  const onRemap = async (header: string, mappedTo: string | null) => {
    const name = data?.profile?.publisher_name
    if (!name) return
    setRemapping(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/ingest/remap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publisherName: name,
          header,
          mappedTo,
          ...(isConstantMappingHeader(header)
            ? {}
            : { knownHeaders: mappingRows.filter((row) => row.kind === "column").map((row) => row.header) }),
        }),
      })
      const json = (await res.json()) as {
        error?: string
        ok?: boolean
        reason?: string
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (json.ok === false) {
        throw new Error(json.reason || "That header is not a column in this schedule")
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remap failed")
    } finally {
      setRemapping(false)
    }
  }

  if (loading) {
    return <LoadingState rows={4} />
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load ingest profile"
        message={error}
        onRetry={() => void load()}
      />
    )
  }

  if (!data) return null

  if (!data.profile) {
    return (
      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Ingest profile</PanelTitle>
            <PanelDescription>
              Mapping lives on the publisher record. First upload creates a
              linked profile.
            </PanelDescription>
          </div>
        </PanelHeader>
        <PanelContent>
          <EmptyState
            icon={<Layers className="h-5 w-5" aria-hidden />}
            title="No ingest profile — first upload creates one"
            message="Upload a schedule at Schedule ingest and pick this catalogue publisher when asked. We never guess."
            action={
              <Button type="button" variant="outline" asChild>
                <a href="/admin/schedule-ingest">Open schedule ingest</a>
              </Button>
            }
          />
        </PanelContent>
      </Panel>
    )
  }

  const profile = data.profile
  const legendEntries = Object.entries(profile.legend_map)

  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>Ingest profile</PanelTitle>
          <PanelDescription>
            Detection label <span className="font-medium text-foreground">{profile.publisher_name}</span>
            {" · "}
            {profile.media_type}
            {" · "}
            grid {profile.grid_semantics}
            {profile.publisher_id != null ? (
              <>
                {" · "}catalogue id{" "}
                <span className="num">{profile.publisher_id}</span>
              </>
            ) : null}
          </PanelDescription>
        </div>
      </PanelHeader>
      <PanelContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Plan field → source column
          </h3>
          <p className="text-xs text-muted-foreground">
            Same remap path as schedule review, keyed by the short profile name.
          </p>
          <div className="overflow-hidden rounded-card border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan field</TableHead>
                  <TableHead>Source column</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappingRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      Empty map — remap from a first upload.
                    </TableCell>
                  </TableRow>
                ) : (
                  mappingRows.map((row) => (
                    <TableRow key={`${row.header}:${row.dest}`}>
                      <TableCell>
                        <select
                          className="h-9 w-full rounded-input border border-border bg-background px-2 text-sm"
                          value={row.dest}
                          disabled={remapping}
                          onChange={(e) => {
                            const next = e.target.value
                            if (row.kind === "constant") {
                              if (!next) void onRemap(row.header, null)
                              return
                            }
                            void onRemap(row.header, next || null)
                          }}
                        >
                          {row.kind === "constant" ? (
                            <option value="">— UNMAPPED —</option>
                          ) : null}
                          {PLAN_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.kind === "constant"
                          ? FIXED_VALUE_COLUMN_LABEL
                          : row.header}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Grid semantics
          </h3>
          <Badge variant="secondary">{profile.grid_semantics}</Badge>
          {legendEntries.length > 0 ? (
            <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {legendEntries.map(([code, status]) => (
                <li
                  key={code}
                  className="rounded-pill border border-border bg-surface-panel px-2 py-1"
                >
                  <span className="font-medium text-foreground">{code}</span>
                  {" → "}
                  {status}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No legend codes.</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Sheet rules</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {profile.sheet_rules.map((rule, i) => (
              <li key={i}>
                <Badge variant="outline">{rule.role}</Badge>{" "}
                {"name_includes" in rule.match
                  ? `name includes “${rule.match.name_includes}”`
                  : "any_line_item_sheet" in rule.match
                    ? "any line-item sheet"
                    : JSON.stringify(rule.match)}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Recent ingest runs
          </h3>
          {data.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
          ) : (
            <div className="overflow-hidden rounded-card border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="num text-xs">
                        {run.createdAt.slice(0, 16).replace("T", " ")}
                      </TableCell>
                      <TableCell>{run.fileName ?? "—"}</TableCell>
                      <TableCell className="num">{pct(run.detectedConfidence)}</TableCell>
                      <TableCell className="num">{pct(run.requiredCoverage)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            run.outcome === "accepted"
                              ? "secondary"
                              : run.outcome === "blocked"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {run.outcome}
                        </Badge>
                        {run.outcomeReason ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {run.outcomeReason}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </PanelContent>
    </Panel>
  )
}
