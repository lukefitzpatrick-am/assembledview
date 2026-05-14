"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FLIGHTS, SUCCESS_METRICS } from "../lib/data";
import type { FlightId } from "../lib/types";

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
  return (
    <div className="mb-3 rounded-lg border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
        Brief
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">step 1 of 4</span>
      </h3>

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
            value={`$${budget.toLocaleString("en-AU")}`}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              const parsed = parseInt(digits, 10);
              onBudgetChange(Number.isFinite(parsed) ? parsed : 0);
            }}
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
