import type { AllocatedChannel, PlannerInputs } from "../lib/types";

interface AvaNarrationProps {
  inputs: PlannerInputs;
  allocated: AllocatedChannel[];
}

// Deterministic narration generated from real engine output. No fabricated
// metrics — every claim ties to a number in the inputs or the scored result.
// In the production version this is where Claude API calls plug in for
// richer language. For now the narration is mechanical-but-honest.
export function AvaNarration({ inputs, allocated }: AvaNarrationProps) {
  const topCh = allocated[0];
  const second = allocated.length >= 2 ? allocated[1] : null;
  const lowCh = allocated.length >= 2 ? allocated[allocated.length - 1] : null;

  if (!topCh) {
    return (
      <div className="px-2 py-4 text-xs text-muted-foreground">
        Select at least one segment to generate narration.
      </div>
    );
  }

  const objText =
    inputs.objective < 40
      ? "brand-shift led"
      : inputs.objective > 60
        ? "action led"
        : "balanced (brand + action)";

  const segText = inputs.segments.map((s) => s.replace(/-/g, " ")).join(" and ");
  const ageText = inputs.ageMax >= 66 ? `${inputs.ageMin}-65+` : `${inputs.ageMin}-${inputs.ageMax}`;
  const genderText = inputs.gender === "all" ? "all genders" : inputs.gender;
  const geoText =
    inputs.geos.includes("au") && inputs.geos.length === 1
      ? "national AU"
      : inputs.geos.map((g) => g.toUpperCase()).join("/");

  const lowReason =
    !lowCh
      ? ""
      : lowCh.ageMod < 0.9
        ? "age mismatch"
        : lowCh.ch.attn < 8
          ? "low attention quality"
          : "weaker fit";

  return (
    <div className="py-1 text-sm leading-relaxed">
      <p className="mb-2">
        This is a <span className="text-muted-foreground">{objText}</span> mix for{" "}
        <span className="text-muted-foreground">{segText}</span>, aged{" "}
        <span className="text-muted-foreground">{ageText}</span>,{" "}
        <span className="text-muted-foreground">{genderText}</span>, across{" "}
        <span className="text-muted-foreground">{geoText}</span>.
      </p>
      <p className="mb-2">
        <strong className="font-medium">{topCh.ch.name}</strong> leads at {Math.round(topCh.pct)}% —
        audience affinity {Math.round(topCh.affAvg)}, age fit {topCh.ageMod.toFixed(2)}×,{" "}
        {topCh.ch.attn}s of active attention per exposure. Effect score {Math.round(topCh.E)}/100
        against the objective slider.
      </p>
      {second && lowCh ? (
        <p className="mb-2">
          <strong className="font-medium">{second.ch.name}</strong> at {Math.round(second.pct)}% provides
          complementary reach. <strong className="font-medium">{lowCh.ch.name}</strong> is deliberately
          light at {Math.round(lowCh.pct)}% — {lowReason} for this combination.
        </p>
      ) : null}
      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        Generated from the deterministic BCS engine — no invented metrics. In production, AVA
        cross-references cultural moments to suggest weekly weighting.
      </p>
    </div>
  );
}
