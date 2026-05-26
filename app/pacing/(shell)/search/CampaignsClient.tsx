"use client";

import { useCallback, useEffect, useState } from "react";
import type { KpiTargets, SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";
import { LineItemPacingTable } from "@/components/pacing-search";

type ApiShape = { asOfDate: string; rows: SearchPacingCampaignRow[] };

export type CampaignsClientProps = {
  isAdmin: boolean;
};

export function CampaignsClient({ isAdmin }: CampaignsClientProps) {
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

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Failed to load: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
      <LineItemPacingTable
        rows={data.rows}
        isAdmin={isAdmin}
        onRowKpiTargetsUpdated={handleRowKpiTargetsUpdated}
      />
    </div>
  );
}
