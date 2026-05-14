"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AgeRangeSlider } from "./AgeRangeSlider";
import { GEOS, SEGMENTS } from "../lib/data";
import type { Gender, GeoId, SegmentId } from "../lib/types";

interface AudienceCardProps {
  ageMin: number;
  ageMax: number;
  gender: Gender;
  geos: GeoId[];
  segments: SegmentId[];
  onAgeChange: (range: [number, number]) => void;
  onGenderChange: (g: Gender) => void;
  onGeosChange: (geos: GeoId[]) => void;
  onSegmentsChange: (segs: SegmentId[]) => void;
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
  { id: "non-binary", label: "Non-binary" },
];

export function AudienceCard({
  ageMin,
  ageMax,
  gender,
  geos,
  segments,
  onAgeChange,
  onGenderChange,
  onGeosChange,
  onSegmentsChange,
}: AudienceCardProps) {
  const toggleGeo = (g: GeoId) => {
    if (g === "au") {
      onGeosChange(["au"]);
      return;
    }
    let next: GeoId[] = geos.filter((x) => x !== "au");
    if (next.includes(g)) next = next.filter((x) => x !== g);
    else next = [...next, g];
    if (next.length === 0) next = ["au"];
    onGeosChange(next);
  };

  const toggleSeg = (s: SegmentId) => {
    if (segments.includes(s)) onSegmentsChange(segments.filter((x) => x !== s));
    else onSegmentsChange([...segments, s]);
  };

  return (
    <div className="mb-3 rounded-lg border bg-card p-5">
      <h3 className="mb-3 text-sm font-medium">Audience</h3>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <FieldLabel>Age range</FieldLabel>
          <AgeRangeSlider min={16} max={66} step={2} value={[ageMin, ageMax]} onChange={onAgeChange} />
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
        <FieldLabel>Geography</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {GEOS.map((g) => (
            <Chip key={g.id} active={geos.includes(g.id)} onClick={() => toggleGeo(g.id)}>
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Roy Morgan Asteroid segments</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => (
            <Chip key={s.id} active={segments.includes(s.id)} onClick={() => toggleSeg(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
