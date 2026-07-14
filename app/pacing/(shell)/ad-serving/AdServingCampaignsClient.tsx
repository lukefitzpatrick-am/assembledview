"use client";

import { useEffect, useState } from "react";
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types";
import { AdServingLineItemTable } from "@/components/pacing-ad-serving/AdServingLineItemTable";
import { Skeleton } from "@/components/ui/skeleton";
import { useSlowLoadHint } from "@/lib/hooks/useSlowLoadHint";

type ApiShape = { asOfDate: string; rows: AdServingPacingCampaignRow[] };

export type AdServingCampaignsClientProps = {
  isAdmin: boolean;
};

export function AdServingCampaignsClient({
  isAdmin: _isAdmin,
}: AdServingCampaignsClientProps) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const showSlowHint = useSlowLoadHint(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/pacing/ad-serving-campaigns", { credentials: "include" })
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

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-3 w-32" />
        <div className="rounded border">
          <div className="relative max-h-[calc(100vh-220px)] overflow-hidden">
            <div className="flex gap-2 border-b p-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
        {showSlowHint ? (
          <p className="text-xs text-muted-foreground">
            Still querying Snowflake — this can take a little longer on a cold load.
          </p>
        ) : null}
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-destructive">Failed to load: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="text-sm text-muted-foreground">
        Ad server verification (CM360) — delivery counts, no spend data
      </div>
      <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
      <AdServingLineItemTable rows={data.rows} asOfDate={data.asOfDate} />
    </div>
  );
}
