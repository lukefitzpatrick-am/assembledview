import { CULTURAL_MOMENTS } from "../lib/data";
import type { FlightId, GeoId } from "../lib/types";

interface CulturalMomentsListProps {
  flight: FlightId;
  geos: GeoId[];
}

export function CulturalMomentsList({ flight, geos }: CulturalMomentsListProps) {
  // If national AU is selected, show every moment in the flight. Otherwise
  // intersect on geo; moments tagged "au" are national and always shown.
  const filtered = CULTURAL_MOMENTS.filter((m) => {
    if (m.flight !== flight) return false;
    if (geos.includes("au")) return true;
    return m.geos.some((g) => geos.includes(g) || g === "au");
  });

  if (filtered.length === 0) {
    return (
      <div className="px-2 py-4 text-xs text-muted-foreground">
        No moments seeded for this flight + geo combination.
      </div>
    );
  }

  return (
    <div>
      {filtered.map((m, i) => (
        <div
          key={`${m.flight}-${i}`}
          className="grid grid-cols-[70px_1fr_auto] items-center gap-3 border-b py-2.5 last:border-b-0"
        >
          <span className="text-[11px] font-medium text-muted-foreground">{m.date}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium">{m.title}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{m.desc}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {m.chans.map((c) => (
              <span
                key={c}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
