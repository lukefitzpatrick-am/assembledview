import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/badge";
import type { ReachProfileRow } from "@/lib/planning/adapter";

interface ReachProfileProps {
  rows: ReachProfileRow[];
  show18Base: boolean;
}

function fmtWc(wc: number): string {
  const n = Math.round(wc);
  return `${n.toLocaleString("en-AU")}k`;
}

export function ReachProfile({ rows, show18Base }: ReachProfileProps) {
  if (rows.length === 0) {
    return (
      <div className="mb-3 rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground">
        No level reach totals in this response.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Reach profile
      </h3>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.channelId} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-medium">
                  {r.level1}
                  {r.label !== r.level1 ? (
                    <span className="font-normal text-muted-foreground"> · {r.label}</span>
                  ) : null}
                </span>
                {show18Base && r.ageBase === 18 ? (
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    18+ base
                  </Badge>
                ) : null}
                {!r.isRmMeasured ? (
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    Benchmark-based — not Roy Morgan
                  </Badge>
                ) : null}
              </div>
              <ProgressBar value={r.reachPct * 100} max={100} size="sm" color="default" />
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-sm tabular-nums">{Math.round(r.reachPct * 100)}%</div>
              <div className="num text-[11px] tabular-nums text-muted-foreground">
                {fmtWc(r.reachWc)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
