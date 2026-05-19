"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FLIGHTS, SUCCESS_METRICS } from "../lib/data";
import type { FlightId } from "../lib/types";

// Parse loose budget strings into a number. Accepts forms like "850000",
// "850k", "$850,000", "1.2m", "1,200,000". Returns null for unparseable
// input so the caller can decide what to do (keep previous value, or zero).
function parseBudgetInput(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const match = cleaned.match(/^([\d.]+)\s*([km])?$/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = match[2];
  if (suffix === "k") return Math.round(n * 1000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

function formatBudget(n: number): string {
  return `$${n.toLocaleString("en-AU")}`;
}

interface BriefCardProps {
  campaignName: string;
  flight: FlightId;
  budget: number;
  successMetric: string;
  onCampaignNameChange: (v: string) => void;
  onFlightChange: (v: FlightId) => void;
  onBudgetChange: (v: number) => void;
  onSuccessMetricChange: (v: string) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

export function BriefCard({
  campaignName,
  flight,
  budget,
  successMetric,
  onCampaignNameChange,
  onFlightChange,
  onBudgetChange,
  onSuccessMetricChange,
}: BriefCardProps) {
  const [budgetDraft, setBudgetDraft] = useState<string>(formatBudget(budget));
  const [budgetFocused, setBudgetFocused] = useState(false);

  useEffect(() => {
    if (!budgetFocused) setBudgetDraft(formatBudget(budget));
  }, [budget, budgetFocused]);

  return (
    <div className="mb-3 rounded-lg border bg-card p-5">
      <h3 className="mb-3 text-sm font-medium">Brief</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <FieldLabel>Campaign</FieldLabel>
          <Input value={campaignName} onChange={(e) => onCampaignNameChange(e.target.value)} />
        </div>

        <div>
          <FieldLabel>Flight window</FieldLabel>
          <Select value={flight} onValueChange={(v) => onFlightChange(v as FlightId)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLIGHTS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel>Budget (AUD)</FieldLabel>
          <Input
            type="text"
            value={budgetDraft}
            onFocus={() => setBudgetFocused(true)}
            onBlur={() => {
              setBudgetFocused(false);
              const parsed = parseBudgetInput(budgetDraft);
              if (parsed !== null) {
                onBudgetChange(parsed);
                setBudgetDraft(formatBudget(parsed));
              } else {
                setBudgetDraft(formatBudget(budget));
              }
            }}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="e.g. 850k or $850,000"
          />
        </div>

        <div>
          <FieldLabel>Success metric</FieldLabel>
          <Select value={successMetric} onValueChange={onSuccessMetricChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUCCESS_METRICS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
