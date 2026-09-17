"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types";
import { AdServingLineItemTable } from "@/components/pacing-ad-serving/AdServingLineItemTable";
import { ChannelLayoutToggle } from "@/components/pacing/channel/ChannelLayoutToggle";
import { ChannelPacingBoard } from "@/components/pacing/channel/ChannelPacingBoard";
import {
  applyPacingRowFilters,
  isPacingClientFilterUnresolved,
  mapAdServingChannelFamilyToMediaType,
  mapAdServingStatusToBand,
} from "@/lib/pacing/filters/applyPacingRowFilters";
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore";
import {
  pacingFiltersActive,
  usePacingClientIdToNameMap,
} from "@/lib/pacing/usePacingClientIdToNameMap";
import {
  PacingClientFilterUnavailable,
  PacingFilterCount,
  PacingFilterEmptyState,
} from "@/components/pacing/PacingFilterResultMeta";
import { lineCardFromAdServing } from "@/lib/pacing/channel/lineCardModel";
import { useChannelLayout } from "@/lib/pacing/channel/channelLayout";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

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

  const filters = usePacingFilterStore((s) => s.filters);
  const { layout } = useChannelLayout("ad-serving");
  const { map: clientIdToName, settled: clientMapSettled } = usePacingClientIdToNameMap();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ asOfDate: filters.as_of_date });
    fetch(`/api/pacing/ad-serving-campaigns?${qs}`, { credentials: "include" })
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
        mediaType: (row) => mapAdServingChannelFamilyToMediaType(row.channelFamily),
        status: (row) => mapAdServingStatusToBand(row.lineItemStatus),
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

  const asOf = data?.asOfDate ?? filters.as_of_date;
  const boardItems = useMemo(
    () => displayed.map((row) => ({ model: lineCardFromAdServing(row, asOf), row })),
    [displayed, asOf],
  );

  const deferredFilters = useDeferredValue(filters);
  const isFilterPending = filters !== deferredFilters;

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <LoadingState rows={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <ErrorState title="Failed to load ad serving pacing" message={error} />
      </div>
    );
  }
  if (!data) return null;

  const total = data.rows.length;
  const filtersOn = pacingFiltersActive(filters);
  const clientFilterPending =
    filters.client_ids.length > 0 && !clientMapSettled;
  const clientFilterUnresolved =
    clientMapSettled &&
    isPacingClientFilterUnresolved(filters.client_ids, clientIdToName);

  return (
    <div className="space-y-4 p-4">
      <div className="text-sm text-muted-foreground">
        Ad server verification (CM360) — delivery counts, no spend data
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
          {filtersOn && !clientFilterPending && !clientFilterUnresolved ? (
            <PacingFilterCount shown={displayed.length} total={total} />
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {isFilterPending ? (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Updating…
            </span>
          ) : null}
          <ChannelLayoutToggle channel="ad-serving" />
        </div>
      </div>
      {total === 0 ? (
        <EmptyState
          title="No ad serving line items"
          message="No ad serving verification data is in scope for this date."
        />
      ) : clientFilterPending ? (
        <LoadingState rows={4} />
      ) : clientFilterUnresolved ? (
        <PacingClientFilterUnavailable />
      ) : filtersOn && displayed.length === 0 ? (
        <PacingFilterEmptyState />
      ) : (
        <ChannelPacingBoard
          items={boardItems}
          asOf={data.asOfDate}
          channel="ad-serving"
          layout={layout}
          renderTable={(rows) => <AdServingLineItemTable rows={rows} asOfDate={data.asOfDate} />}
        />
      )}
    </div>
  );
}
