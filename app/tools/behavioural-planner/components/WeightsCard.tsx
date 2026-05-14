"use client";

import { Slider } from "@/components/ui/slider";
import type { Weights } from "../lib/types";

interface WeightsCardProps {
  weights: Weights;
  onChange: (w: Weights) => void;
}

function WeightRow({
  label,
  value,
  onChange,
  normalised,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  normalised: string;
}) {
  return (
    <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
      <label className="whitespace-nowrap text-xs text-muted-foreground">{label}</label>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
      <span className="w-10 text-right text-[11px] font-medium tabular-nums">{normalised}</span>
    </div>
  );
}

export function WeightsCard({ weights, onChange }: WeightsCardProps) {
  const sum = weights.A + weights.T + weights.E + weights.C || 1;
  const norm = (v: number) => (v / sum).toFixed(2);

  return (
    <div className="mb-3 rounded-lg border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
        BCS weights
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">step 4 of 4 · optional</span>
      </h3>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        <WeightRow
          label="Audience fit (A)"
          value={weights.A}
          onChange={(v) => onChange({ ...weights, A: v })}
          normalised={norm(weights.A)}
        />
        <WeightRow
          label="Attention (T)"
          value={weights.T}
          onChange={(v) => onChange({ ...weights, T: v })}
          normalised={norm(weights.T)}
        />
        <WeightRow
          label="Effect (E)"
          value={weights.E}
          onChange={(v) => onChange({ ...weights, E: v })}
          normalised={norm(weights.E)}
        />
        <WeightRow
          label="Cost (C)"
          value={weights.C}
          onChange={(v) => onChange({ ...weights, C: v })}
          normalised={norm(weights.C)}
        />
      </div>
    </div>
  );
}
