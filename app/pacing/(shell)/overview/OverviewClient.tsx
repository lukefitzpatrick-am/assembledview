"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KpiTargets, SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";
import { LineItemPacingTable } from "@/components/pacing-search";
import { computeRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus";

type ApiShape = { asOfDate: string; rows: SearchPacingCampaignRow[] };

export type OverviewClientProps = {
  isAdmin: boolean;
};

type StatusCounts = {
  onTrack: number;
  ahead: number;
  behind: number;
  noData: number;
  kpiPending: number;
};

export function OverviewClient({ isAdmin }: OverviewClientProps) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/pacing/campaigns", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as ApiShape;
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRowKpiTargetsUpdated = useCallback(
    (lineItemId: string, targets: KpiTargets) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) =>
            row.lineItemId === lineItemId ? { ...row, kpiTargets: targets } : row,
          ),
        };
      });
    },
    [],
  );

  const counts: StatusCounts = useMemo(() => {
    if (!data) return { onTrack: 0, ahead: 0, behind: 0, noData: 0, kpiPending: 0 };
    const c: StatusCounts = { onTrack: 0, ahead: 0, behind: 0, noData: 0, kpiPending: 0 };
    for (const row of data.rows) {
      switch (row.lineItemStatus) {
        case "on-track":
          c.onTrack++;
          break;
        case "ahead":
          c.ahead++;
          break;
        case "behind":
          c.behind++;
          break;
        case "no-data":
          c.noData++;
          break;
      }
      if (computeRowKpiStatus(row) === "kpi-pending") {
        c.kpiPending++;
      }
    }
    return c;
  }, [data]);

  const behindRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => r.lineItemStatus === "behind");
  }, [data]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Failed to load: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Pacing overview</h1>
        <p className="text-xs text-muted-foreground">
          Underperforming line items across all clients in your scope. As of {data.asOfDate}.
        </p>
      </header>

      <StatusSummary counts={counts} />

      {behindRows.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          No underperforming line items right now.
          {counts.onTrack + counts.ahead > 0 ? (
            <>
              {" "}
              {counts.onTrack + counts.ahead} active line item
              {counts.onTrack + counts.ahead === 1 ? "" : "s"} on track or ahead.
            </>
          ) : null}
        </div>
      ) : (
        <LineItemPacingTable
          rows={behindRows}
          isAdmin={isAdmin}
          onRowKpiTargetsUpdated={handleRowKpiTargetsUpdated}
        />
      )}
    </div>
  );
}

function StatusSummary({ counts }: { counts: StatusCounts }) {
  const items: Array<{ label: string; value: number; tone: string }> = [
    { label: "Behind", value: counts.behind, tone: "text-status-behind-fg" },
    { label: "On track", value: counts.onTrack, tone: "text-status-on-track-fg" },
    { label: "Ahead", value: counts.ahead, tone: "text-status-ahead-fg" },
    { label: "No data", value: counts.noData, tone: "text-muted-foreground" },
    { label: "KPI Pending", value: counts.kpiPending, tone: "text-muted-foreground" },
  ];
  return (
    <div className="grid grid-cols-5 gap-2 rounded-card border border-border bg-card p-3 shadow-e0">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </span>
          <span className={`num text-lg font-semibold ${item.tone}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
