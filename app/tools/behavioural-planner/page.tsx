"use client";

import { useEffect, useState } from "react";
import { DEFAULT_INPUTS } from "./lib/data";
import { PlannerForm, type FormState } from "./components/PlannerForm";

const initialState: FormState = {
  objective: DEFAULT_INPUTS.objective,
  segments: [...DEFAULT_INPUTS.segments],
  weights: { ...DEFAULT_INPUTS.weights },
  flight: DEFAULT_INPUTS.flight,
  budget: DEFAULT_INPUTS.budget,
  ageMin: DEFAULT_INPUTS.ageMin,
  ageMax: DEFAULT_INPUTS.ageMax,
  gender: DEFAULT_INPUTS.gender,
  geos: [...DEFAULT_INPUTS.geos],
  campaignName: DEFAULT_INPUTS.campaignName,
  successMetric: DEFAULT_INPUTS.successMetric,
};

export default function BehaviouralPlannerPage() {
  const [state, setState] = useState<FormState>(initialState);

  useEffect(() => {
    console.log("[BCP Stage 2] Form state:", state);
  }, [state]);

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-baseline justify-between border-b pb-3">
        <div>
          <h1 className="text-xl font-medium">
            Behavioural change planner
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              working title · v0.2 mock
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Stage 2 of 4: inputs only. Results panel comes in Stage 3.</p>
        </div>
      </div>

      <PlannerForm state={state} onChange={setState} />

      <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="mb-1 font-medium">Verification</p>
        <p className="text-muted-foreground">
          Every change to any input above should log a fresh{" "}
          <code className="text-xs">[BCP Stage 2]</code> entry to the browser console with the full form state.
        </p>
      </div>
    </div>
  );
}
