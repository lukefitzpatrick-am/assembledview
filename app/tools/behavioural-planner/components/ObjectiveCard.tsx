"use client";

import { Slider } from "@/components/ui/slider";

interface ObjectiveCardProps {
  objective: number;
  onChange: (v: number) => void;
}

export function ObjectiveCard({ objective, onChange }: ObjectiveCardProps) {
  return (
    <div className="mb-3 rounded-lg border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
        Objective
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">step 2 of 4</span>
      </h3>

      <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Brand shift ←→ direct action
      </label>

      <div className="flex items-center gap-3">
        <Slider
          min={0}
          max={100}
          step={1}
          value={[objective]}
          onValueChange={(v) => onChange(v[0] ?? objective)}
          className="flex-1"
        />
        <span className="w-8 text-right text-sm font-medium tabular-nums">{objective}</span>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>0 — pure brand shift</span>
        <span>50 — balanced</span>
        <span>100 — pure action</span>
      </div>
    </div>
  );
}
