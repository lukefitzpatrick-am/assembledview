"use client";

import { useCallback, useEffect, useState } from "react";
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types";
import { DirectCampaignsTable } from "@/components/pacing-direct/DirectCampaignsTable";
import { Skeleton } from "@/components/ui/skeleton";

type ApiShape = {
  asOfDate: string;
  includeHistorical: boolean;
  campaigns: DirectCampaignGroup[];
};

export type DirectCampaignsClientProps = {
  isAdmin: boolean;
};

export function DirectCampaignsClient({ isAdmin: _isAdmin }: DirectCampaignsClientProps) {
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [data, setData] = useState<ApiShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((historical: boolean) => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = historical ? "?includeHistorical=1" : "";
    fetch(`/api/pacing/direct-campaigns${qs}`, { credentials: "include" })
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

  useEffect(() => {
    return load(includeHistorical);
  }, [includeHistorical, load]);

  if (loading && !data) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-32" />
        <div className="rounded border p-2 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-destructive">Failed to load: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="text-sm text-muted-foreground">
        Fixed-cost media — reported spend vs platform actuals
      </div>
      <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
      <DirectCampaignsTable
        campaigns={data.campaigns}
        includeHistorical={includeHistorical}
        onIncludeHistoricalChange={setIncludeHistorical}
      />
      {loading ? (
        <div className="text-xs text-muted-foreground">Refreshing…</div>
      ) : null}
    </div>
  );
}
