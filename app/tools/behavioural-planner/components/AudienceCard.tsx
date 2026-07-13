"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AgeRangeSlider } from "./AgeRangeSlider";
import { bandsFromRange, formatAgeBandLabel, rangeFromBands, snapAgeRange } from "../lib/ageBands";
import type { Gender } from "../lib/types";
import type {
  PlanningAgeBand,
  PlanningSegment,
  PlanningState,
  ReachBasis,
} from "@/lib/planning/types";
import { PLANNING_STATES } from "@/lib/planning/types";
import { Info } from "lucide-react";

interface AudienceCardProps {
  segments: PlanningSegment[];
  segmentId: string;
  states: PlanningState[];
  gender: Gender;
  ageBands: PlanningAgeBand[];
  reachBasis: ReachBasis;
  onSegmentChange: (id: string) => void;
  onStatesChange: (states: PlanningState[]) => void;
  onGenderChange: (g: Gender) => void;
  onAgeBandsChange: (bands: PlanningAgeBand[]) => void;
  onReachBasisChange: (basis: ReachBasis) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border-0 bg-transparent p-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <Badge
        variant={active ? "info" : "outline"}
        size="sm"
        className={cn(
          "cursor-pointer border transition-colors",
          !active && "text-muted-foreground hover:bg-muted/80"
        )}
      >
        {children}
      </Badge>
    </button>
  );
}

const GENDERS: { id: Gender; label: string }[] = [
  { id: "all", label: "All" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

const STATE_LABELS: Record<PlanningState, string> = {
  NAT: "National",
  NSW: "NSW",
  VIC: "VIC",
  QLD: "QLD",
  SA: "SA",
  WA: "WA",
  TAS: "TAS",
  NT: "NT",
};

export function AudienceCard({
  segments,
  segmentId,
  states,
  gender,
  ageBands,
  reachBasis,
  onSegmentChange,
  onStatesChange,
  onGenderChange,
  onAgeBandsChange,
  onReachBasisChange,
}: AudienceCardProps) {
  const [ageLo, ageHi] = rangeFromBands(ageBands);

  const toggleState = (s: PlanningState) => {
    if (s === "NAT") {
      onStatesChange(["NAT"]);
      return;
    }
    let next = states.filter((x) => x !== "NAT") as PlanningState[];
    if (next.includes(s)) next = next.filter((x) => x !== s);
    else next = [...next, s];
    if (next.length === 0) next = ["NAT"];
    onStatesChange(next);
  };

  const handleAgeChange = ([lo, hi]: [number, number]) => {
    const snapped = snapAgeRange(lo, hi);
    onAgeBandsChange(bandsFromRange(snapped[0], snapped[1]));
  };

  return (
    <div className="mb-3 rounded-lg border bg-card p-5">
      <h3 className="mb-3 text-sm font-medium">Audience</h3>

      <div className="mb-4">
        <FieldLabel>Segment lens</FieldLabel>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Segments are separate lenses and can&apos;t be combined.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {segments.map((s) => (
            <Chip
              key={s.segment_id}
              active={segmentId === s.segment_id}
              onClick={() => onSegmentChange(s.segment_id)}
            >
              {s.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <FieldLabel>Age bands</FieldLabel>
          <AgeRangeSlider
            min={14}
            max={75}
            step={1}
            value={[ageLo, ageHi]}
            onChange={handleAgeChange}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Selected: {formatAgeBandLabel(ageBands)}
          </p>
        </div>

        <div>
          <FieldLabel>Gender</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {GENDERS.map((g) => (
              <Chip key={g.id} active={gender === g.id} onClick={() => onGenderChange(g.id)}>
                {g.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <FieldLabel>States</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {PLANNING_STATES.map((s) => (
            <Chip key={s} active={states.includes(s)} onClick={() => toggleState(s)}>
              {STATE_LABELS[s]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>
          <span className="inline-flex items-center gap-1">
            Reach basis
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground"
                    aria-label="About reach basis"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Addressable = digitally buyable reach. Total = all measured reach including
                  non-addressable. Default Addressable for planning.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        </FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={reachBasis === "addressable"}
            onClick={() => onReachBasisChange("addressable")}
          >
            Addressable
          </Chip>
          <Chip active={reachBasis === "total"} onClick={() => onReachBasisChange("total")}>
            Total
          </Chip>
        </div>
      </div>
    </div>
  );
}
