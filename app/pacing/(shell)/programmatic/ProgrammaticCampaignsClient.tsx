"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types";
import { LineItemPacingTable } from "@/components/pacing-programmatic/LineItemPacingTable";
import { Skeleton } from "@/components/ui/skeleton";
import {
  applyPacingRowFilters,
  mapProgrammaticChannelFamilyToMediaType,
} from "@/lib/pacing/filters/applyPacingRowFilters";
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore";
import {
  pacingFiltersActive,
  usePacingClientIdToNameMap,
} from "@/lib/pacing/usePacingClientIdToNameMap";
import {
  PacingFilterCount,
  PacingFilterEmptyState,
} from "@/components/pacing/PacingFilterResultMeta";

type ApiShape = { asOfDate: string; rows: ProgrammaticPacingCampaignRow[] };

export type ProgrammaticCampaignsClientProps = {
  isAdmin: boolean;
};

export function ProgrammaticCampaignsClient({
  isAdmin: _isAdmin,
}: ProgrammaticCampaignsClientProps) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filters = usePacingFilterStore((s) => s.filters);
  const clientIdToName = usePacingClientIdToNameMap();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ asOfDate: filters.as_of_date });
    fetch(`/api/pacing/programmatic-campaigns?${qs}`, { credentials: "include" })
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
  }, [filters.as_of_date]);

  const displayed = useMemo(() => {
    if (!data) return [];
    return applyPacingRowFilters(
      data.rows,
      {
        client_ids: filters.client_ids,
        media_types: filters.media_types,
        statuses: filters.statuses,
        search: filters.search,
      },
      {
        clientName: (row) => row.clientName,
        mediaType: (row) => mapProgrammaticChannelFamilyToMediaType(row.channelFamily),
        status: (row) => row.lineItemStatus,
        searchText: (row) =>
          [
            row.clientName,
            row.campaignName,
            row.lineItemId,
            row.mbaNumber,
            row.creativeTargeting,
          ].join(" "),
      },
      clientIdToName,
    );
  }, [data, filters.client_ids, filters.media_types, filters.statuses, filters.search, clientIdToName]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-3 w-32" />
        <div className="rounded border">
          <div className="relative max-h-[calc(100vh-220px)] overflow-hidden">
            <div className="flex gap-2 border-b p-2">
              <Skeleton className="h-8 w-6 shrink-0" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-destructive">Failed to load: {error}</div>;
  if (!data) return null;

  const total = data.rows.length;
  const filtersOn = pacingFiltersActive(filters);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
        {filtersOn ? <PacingFilterCount shown={displayed.length} total={total} /> : null}
      </div>
      {filtersOn && displayed.length === 0 ? (
        <PacingFilterEmptyState />
      ) : (
        <LineItemPacingTable rows={displayed} asOfDate={data.asOfDate} />
      )}
    </div>
  );
}
