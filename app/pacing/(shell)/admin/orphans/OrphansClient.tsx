"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

type OrphanRow = {
  channel: string;
  platformLineItemId: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  currentLineItemId: string | null;
  spendLast30d: number;
  impressionsLast30d: number;
  firstSeenDate: string;
  lastSeenDate: string;
};

type LiveLineItem = {
  lineItemId: string;
  mbaNumber: string;
  campaignName: string;
  clientName: string;
  totalLineItemBudget: number;
};

const currencyFmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const numberFmt = new Intl.NumberFormat("en-AU");

export function OrphansClient() {
  const { toast } = useToast();
  const [orphans, setOrphans] = useState<OrphanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedOrphan, setSelectedOrphan] = useState<OrphanRow | null>(null);
  const [lineItems, setLineItems] = useState<LiveLineItem[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const [lineItemSearch, setLineItemSearch] = useState("");
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const loadOrphans = useCallback(async () => {
    setError(null);
    setOrphans(null);
    try {
      const r = await fetch("/api/pacing/admin/orphans", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { orphans: OrphanRow[] };
      setOrphans(json.orphans);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadOrphans();
  }, [loadOrphans, reloadKey]);

  const filteredLineItems = useMemo(() => {
    const q = lineItemSearch.trim().toLowerCase();
    if (!q) return lineItems;
    return lineItems.filter(
      (li) =>
        li.lineItemId.includes(q) ||
        li.mbaNumber.toLowerCase().includes(q) ||
        li.campaignName.toLowerCase().includes(q) ||
        li.clientName.toLowerCase().includes(q)
    );
  }, [lineItems, lineItemSearch]);

  const selectedLineItem = lineItems.find((li) => li.lineItemId === selectedLineItemId) ?? null;

  const openAssign = useCallback(async (orphan: OrphanRow) => {
    setSelectedOrphan(orphan);
    setSelectedLineItemId(null);
    setNote("");
    setLineItemSearch("");
    setAssignOpen(true);
    setLineItemsLoading(true);
    try {
      const r = await fetch("/api/pacing/admin/orphans/live-line-items", {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { lineItems: LiveLineItem[] };
      setLineItems(json.lineItems);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not load line items",
        description: e instanceof Error ? e.message : "Request failed",
      });
      setLineItems([]);
    } finally {
      setLineItemsLoading(false);
    }
  }, [toast]);

  const onApplyClick = useCallback(() => {
    if (!selectedOrphan || !selectedLineItemId) return;
    setConfirmOpen(true);
  }, [selectedOrphan, selectedLineItemId]);

  const onConfirmAssign = useCallback(async () => {
    if (!selectedOrphan || !selectedLineItemId) return;
    setAssignBusy(true);
    try {
      const r = await fetch("/api/pacing/admin/orphans/assign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: selectedOrphan.channel,
          platformLineItemId: selectedOrphan.platformLineItemId,
          lineItemId: selectedLineItemId,
          adGroupName: selectedOrphan.adGroupName,
          campaignName: selectedOrphan.campaignName,
          note: note.trim() || undefined,
        }),
      });
      const body = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) {
        if (body.error === "line_item_not_live") {
          toast({
            variant: "destructive",
            title: "Line item no longer live",
            description: "Refreshing orphan list.",
          });
          setReloadKey((k) => k + 1);
          return;
        }
        throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      }

      setOrphans((prev) =>
        prev
          ? prev.filter(
              (o) =>
                !(
                  o.channel === selectedOrphan.channel &&
                  o.platformLineItemId === selectedOrphan.platformLineItemId
                )
            )
          : prev
      );
      setConfirmOpen(false);
      setAssignOpen(false);
      toast({
        title: "Override applied",
        description:
          "Don't forget to rename the ad group in Google Ads so the daily refresh keeps the mapping.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Assign failed",
        description: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setAssignBusy(false);
    }
  }, [note, selectedLineItemId, selectedOrphan, toast]);

  if (error) {
    return <div className="p-6 text-sm text-destructive">Failed: {error}</div>;
  }
  if (!orphans) {
    return <div className="p-6 text-sm text-muted-foreground">Loading orphans…</div>;
  }

  return (
    <>
      <div className="space-y-4 p-4">
        <div>
          <h1 className="text-lg font-semibold">Orphan ad groups</h1>
          <p className="text-xs text-muted-foreground">
            {orphans.length} pending. Daily refresh runs with a 7-day window — if an override
            isn&apos;t followed by a Google Ads rename within 7 days, the orphan may reappear.
          </p>
        </div>

        <div className="overflow-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2">Channel</th>
                <th className="p-2">Ad group</th>
                <th className="p-2">Current LINE_ITEM_ID</th>
                <th className="p-2">Campaign</th>
                <th className="p-2 text-right">Spend (30d)</th>
                <th className="p-2 text-right">Impressions</th>
                <th className="p-2">First seen</th>
                <th className="p-2">Last seen</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((o) => (
                <tr key={`${o.channel}|${o.platformLineItemId}`} className="border-t">
                  <td className="p-2">{o.channel}</td>
                  <td className="p-2">{o.adGroupName}</td>
                  <td className="p-2 font-mono">{o.currentLineItemId || "—"}</td>
                  <td className="p-2">{o.campaignName}</td>
                  <td className="p-2 text-right">{currencyFmt.format(o.spendLast30d)}</td>
                  <td className="p-2 text-right">{numberFmt.format(o.impressionsLast30d)}</td>
                  <td className="p-2">{o.firstSeenDate}</td>
                  <td className="p-2">{o.lastSeenDate}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 hover:bg-muted"
                      onClick={() => void openAssign(o)}
                    >
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign line item</DialogTitle>
            <DialogDescription>
              {selectedOrphan?.adGroupName} ({selectedOrphan?.channel})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Search by ID, MBA, client, campaign…"
              value={lineItemSearch}
              onChange={(e) => setLineItemSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-auto rounded border">
              {lineItemsLoading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading line items…
                </div>
              ) : filteredLineItems.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No matching line items.</p>
              ) : (
                <ul className="divide-y text-xs">
                  {filteredLineItems.slice(0, 80).map((li) => (
                    <li key={li.lineItemId}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left hover:bg-muted ${
                          selectedLineItemId === li.lineItemId ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedLineItemId(li.lineItemId)}
                      >
                        <div className="font-mono">{li.lineItemId}</div>
                        <div className="text-muted-foreground">
                          {li.clientName} · {li.campaignName} · {li.mbaNumber} ·{" "}
                          {currencyFmt.format(li.totalLineItemBudget)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedLineItem ? (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedLineItem.clientName} / {selectedLineItem.campaignName} (
                {selectedLineItem.mbaNumber})
              </p>
            ) : null}

            <Textarea
              placeholder="Optional note for audit log"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!selectedLineItemId} onClick={onApplyClick}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm override</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Channel:</span> {selectedOrphan?.channel}
                </p>
                <p>
                  <span className="font-medium">Ad group:</span> {selectedOrphan?.adGroupName}
                </p>
                <p>
                  <span className="font-medium">LINE_ITEM_ID:</span>{" "}
                  <span className="font-mono">{selectedOrphan?.currentLineItemId || "—"}</span>
                  {" → "}
                  <span className="font-mono">{selectedLineItemId}</span>
                </p>
                {selectedLineItem ? (
                  <>
                    <p>
                      <span className="font-medium">Campaign:</span> {selectedLineItem.campaignName}
                    </p>
                    <p>
                      <span className="font-medium">MBA:</span> {selectedLineItem.mbaNumber}
                    </p>
                    <p>
                      <span className="font-medium">Budget:</span>{" "}
                      {currencyFmt.format(selectedLineItem.totalLineItemBudget)}
                    </p>
                  </>
                ) : null}
                <p className="text-destructive">
                  This writes directly to Snowflake. The daily refresh will overwrite this if the
                  Google Ads ad group isn&apos;t renamed within 7 days to include the correct suffix.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assignBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={assignBusy}
              onClick={(ev) => {
                ev.preventDefault();
                void onConfirmAssign();
              }}
            >
              {assignBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
