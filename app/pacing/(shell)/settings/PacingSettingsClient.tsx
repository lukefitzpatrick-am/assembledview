"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { useToast } from "@/components/ui/use-toast"
import {
  fetchPacingAlertSubscriptions,
  fetchSearchMappingsNoRecentDelivery,
  postResyncPacingMappingsToSnowflake,
  postSyncPacingFromSearchContainers,
} from "@/lib/xano/pacing-client"
import type { PacingAlertSubscription, SearchMappingNoRecentDeliveryRow } from "@/lib/xano/pacing-types"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertTriangle, Bell, Database, Loader2 } from "lucide-react"

type TestSummaryResponse = {
  processed?: number
  sent?: number
  skipped?: number
  errors?: number
  test?: boolean
  subscription_id?: number
  outcome?: string
  meta?: string | null
  error?: string
}

export default function PacingSettingsClient() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [searchSyncBusy, setSearchSyncBusy] = useState(false)
  const [subs, setSubs] = useState<PacingAlertSubscription[]>([])
  const [subsLoading, setSubsLoading] = useState(true)
  const [testBusyId, setTestBusyId] = useState<number | null>(null)
  const [testResultById, setTestResultById] = useState<Record<number, string>>({})
  const [noDeliveryRows, setNoDeliveryRows] = useState<SearchMappingNoRecentDeliveryRow[]>([])
  const [noDeliveryLoading, setNoDeliveryLoading] = useState(true)
  const [noDeliveryBusy, setNoDeliveryBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setSubsLoading(true)
      try {
        const res = await fetchPacingAlertSubscriptions()
        if (cancelled) return
        setSubs(res.data)
      } catch {
        if (!cancelled) setSubs([])
      } finally {
        if (!cancelled) setSubsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadNoRecentDelivery = useCallback(async () => {
    setNoDeliveryBusy(true)
    try {
      const res = await fetchSearchMappingsNoRecentDelivery()
      setNoDeliveryRows(res.data)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not load search mapping diagnostics",
        description: e instanceof Error ? e.message : "Request failed",
      })
      setNoDeliveryRows([])
    } finally {
      setNoDeliveryBusy(false)
      setNoDeliveryLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadNoRecentDelivery()
  }, [loadNoRecentDelivery])

  const onResync = useCallback(async () => {
    setBusy(true)
    try {
      const counts = await postResyncPacingMappingsToSnowflake()
      toast({
        title: "Snowflake mappings resynced",
        description: `Inserted ${counts.inserted}, updated ${counts.updated}, removed (replaced) ${counts.deleted} prior rows.`,
      })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Resync failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusy(false)
    }
  }, [toast])

  const onResyncSearchMappings = useCallback(async () => {
    setSearchSyncBusy(true)
    try {
      const c = await postSyncPacingFromSearchContainers()
      toast({
        title: "Search pacing mappings synced",
        description: `Created ${c.created}, updated ${c.updated}, deactivated ${c.deactivated}. Snowflake refresh ran for line-item pacing.`,
      })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Search sync failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setSearchSyncBusy(false)
    }
  }, [toast])

  const onSendTest = useCallback(
    async (subscriptionId: number) => {
      setTestBusyId(subscriptionId)
      try {
        const res = await fetch(
          `/api/pacing/send-daily-summary?subscription_id=${subscriptionId}&test=true`,
          { method: "POST" }
        )
        const body = (await res.json()) as TestSummaryResponse
        if (!res.ok) {
          setTestResultById((m) => ({
            ...m,
            [subscriptionId]: JSON.stringify({ error: body.error ?? res.statusText, ...body }, null, 2),
          }))
          toast({
            variant: "destructive",
            title: "Test send failed",
            description: typeof body.error === "string" ? body.error : `HTTP ${res.status}`,
          })
          return
        }
        setTestResultById((m) => ({ ...m, [subscriptionId]: JSON.stringify(body, null, 2) }))
        toast({
          title: "Test run finished",
          description: `Outcome: ${body.outcome ?? "—"} (sent ${body.sent ?? 0}, skipped ${body.skipped ?? 0}, errors ${body.errors ?? 0})`,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Request failed"
        setTestResultById((m) => ({ ...m, [subscriptionId]: JSON.stringify({ error: msg }, null, 2) }))
        toast({ variant: "destructive", title: "Test send failed", description: msg })
      } finally {
        setTestBusyId(null)
      }
    },
    [toast]
  )

  return (
    <div className="space-y-8">
      <Panel className="border-muted/70 scroll-mt-24 bg-card shadow-sm">
        <PanelHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground">
              <Database className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <PanelTitle className="text-lg">Snowflake DIM_PLAN_MAPPING</PanelTitle>
              <PanelDescription>
                Full reload from Xano into{" "}
                <code className="text-xs">ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING</code>, then refresh{" "}
                <code className="text-xs">FACT_LINE_ITEM_PACING_DAILY</code>. Use if a write-through sync was
                missed.
              </PanelDescription>
            </div>
          </div>
        </PanelHeader>
        <PanelContent standalone className="flex flex-wrap gap-3 pt-0">
          <Button type="button" onClick={onResync} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Resync mappings to Snowflake
          </Button>
          <Button
            type="button"
            id="resync-search-mappings"
            variant="secondary"
            onClick={onResyncSearchMappings}
            disabled={searchSyncBusy}
          >
            {searchSyncBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Resync search mappings
          </Button>
        </PanelContent>
        <p className="mt-3 text-xs text-muted-foreground px-1">
          <span className="font-medium">Resync search mappings</span> rebuilds <code className="text-[10px]">pacing_mappings</code>{" "}
          rows for paid search from <code className="text-[10px]">media_plan_search</code> (suffix / line id match), then
          updates Snowflake and refreshes <code className="text-[10px]">FACT_LINE_ITEM_PACING_DAILY</code>.
        </p>
      </Panel>

      <Panel className="border-muted/70 bg-card shadow-sm" id="search-mappings-no-recent-delivery">
        <PanelHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <PanelTitle className="text-lg">Search mappings with no recent delivery</PanelTitle>
              <PanelDescription>
                Active <code className="text-[10px]">suffix_id</code> search rows in{" "}
                <code className="text-[10px]">DIM_PLAN_MAPPING</code> with no matching spend in{" "}
                <code className="text-[10px]">FACT_LINE_ITEM_PACING_DAILY</code> in the last 7 days (up to 50).
                Usually a typo in the line item code, a renamed Google Ads ad group, or no delivery yet. See{" "}
                <code className="text-[10px]">docs/pacing/search-suffix-matching.md</code> for remediation.
              </PanelDescription>
            </div>
          </div>
        </PanelHeader>
        <PanelContent standalone className="space-y-3 pt-0">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={noDeliveryBusy}
              onClick={() => void loadNoRecentDelivery()}
            >
              {noDeliveryBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Refresh list
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-border/60">
            {noDeliveryLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : noDeliveryRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No issues found — every active search suffix mapping has at least one fact row in the last 7 days.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>AV line item ID</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Code (suffix)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {noDeliveryRows.map((r, i) => (
                    <TableRow key={`${r.av_line_item_id ?? i}-${i}`}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {r.av_line_item_id ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[14rem] text-sm">{r.av_line_item_label ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {r.av_line_item_code ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </PanelContent>
      </Panel>

      <Panel className="border-muted/70 bg-card shadow-sm" id="alert-subscriptions">
        <PanelHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground">
              <Bell className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <PanelTitle className="text-lg">Pacing alert emails</PanelTitle>
              <PanelDescription>
                Daily summary cron runs at <span className="font-medium">20:30 UTC</span> (~06:30 Melbourne). Use
                <span className="font-medium"> Send test now </span>
                to verify SendGrid and filters for a subscription.
              </PanelDescription>
            </div>
          </div>
        </PanelHeader>
        <PanelContent standalone className="space-y-4 pt-0">
          {subsLoading ? (
            <p className="text-sm text-muted-foreground">Loading subscriptions…</p>
          ) : subs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alert subscriptions yet.</p>
          ) : (
            <ul className="space-y-4">
              {subs.map((sub) => (
                <li
                  key={sub.id}
                  className="rounded-lg border border-border/60 bg-background/50 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-medium">
                        Subscription #{sub.id}
                        {sub.is_active ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(active)</span>
                        ) : (
                          <span className="ml-2 text-xs font-normal text-amber-700">(inactive)</span>
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        User #{sub.users_id} · min severity: {sub.min_severity} · channel: {sub.channel || "email"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Clients: {sub.clients_ids?.join(", ") || "—"} · Media:{" "}
                        {sub.media_types?.join(", ") || "—"} · empty digest:{" "}
                        {sub.send_when_no_alerts ? "yes" : "no"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={testBusyId === sub.id}
                        onClick={() => void onSendTest(sub.id)}
                      >
                        {testBusyId === sub.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Send test now
                      </Button>
                    </div>
                  </div>
                  {testResultById[sub.id] ? (
                    <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-xs leading-relaxed">
                      {testResultById[sub.id]}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PanelContent>
      </Panel>
    </div>
  )
}
