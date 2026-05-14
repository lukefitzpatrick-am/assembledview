"use client";

import { useEffect } from "react";
import { computeBcs, allocate, totalBcs } from "./lib/bcs-engine";
import { DEFAULT_INPUTS } from "./lib/data";

export default function BehaviouralPlannerPage() {
  useEffect(() => {
    // Stage 1 smoke test: run the engine with defaults and log the result
    const inputs = {
      objective: DEFAULT_INPUTS.objective,
      segments: [...DEFAULT_INPUTS.segments],
      weights: DEFAULT_INPUTS.weights,
      flight: DEFAULT_INPUTS.flight,
      budget: DEFAULT_INPUTS.budget,
      ageMin: DEFAULT_INPUTS.ageMin,
      ageMax: DEFAULT_INPUTS.ageMax,
      gender: DEFAULT_INPUTS.gender,
      geos: [...DEFAULT_INPUTS.geos],
    };
    const scored = computeBcs(inputs);
    const allocated = allocate(scored, inputs.budget);
    console.log(
      "[BCP Stage 1] Engine smoke test — scored channels (top 5, BCS desc):",
      scored.slice(0, 5).map((s) => ({ name: s.ch.name, bcs: Math.round(s.bcs) }))
    );
    console.log(
      "[BCP Stage 1] Allocated (top 5):",
      allocated.slice(0, 5).map((a) => ({ name: a.ch.name, pct: Math.round(a.pct), dollars: a.dollars }))
    );
    console.log("[BCP Stage 1] Total BCS:", Math.round(totalBcs(allocated)));
  }, []);

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-medium mb-2">BCP — Stage 1 complete</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Behavioural change planner mock: route scaffolded, seeded data loaded, BCS engine running.
          Open browser devtools console to verify the engine smoke test.
        </p>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium mb-2">Stage progress</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>Stage 1: Scaffold, data, engine — complete</li>
            <li>Stage 2: Form (inputs) — pending</li>
            <li>Stage 3: Results panel — pending</li>
            <li>Stage 4: Polish — pending</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
