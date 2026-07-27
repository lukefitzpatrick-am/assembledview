import type { AllocatedChannel } from "../lib/types";
import { BcsBadge } from "./BcsBadge";
import { Badge } from "@/components/ui/badge";

interface ChannelMixTableProps {
  allocated: AllocatedChannel[];
  show18Base: boolean;
}

function fmtDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n / 1000)}k`;
}

export function ChannelMixTable({ allocated, show18Base }: ChannelMixTableProps) {
  if (allocated.length === 0) {
    return (
      <div className="px-2 py-4 text-xs text-muted-foreground">
        Select a segment lens and wait for audience data to compute a mix.
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[1.4fr_60px_1fr_60px_50px] items-center gap-2 border-b px-1 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Channel</span>
        <span>BCS</span>
        <span>Allocation</span>
        <span>Reach</span>
        <span>aAPM</span>
      </div>

      {allocated.map((a) => (
        <div
          key={a.ch.id}
          className="grid grid-cols-[1.4fr_60px_1fr_60px_50px] items-center gap-2 border-b px-1 py-2 text-sm last:border-b-0"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="block h-4 w-1 shrink-0 rounded-sm"
                style={{ background: a.ch.color }}
                aria-hidden
              />
              <span className="truncate">{a.ch.name}</span>
            </span>
            <span className="flex flex-wrap gap-1 pl-3">
              <Badge variant="outline" size="sm" className="text-[10px] font-normal">
                Source:{" "}
                {a.ch.pillarSources?.A ??
                  (a.ch.isRmMeasured
                    ? "Roy Morgan"
                    : "Assembled seed — pending warehouse source")}
              </Badge>
              {show18Base && a.ch.ageBase === 18 ? (
                <Badge variant="outline" size="sm" className="text-[10px] font-normal">
                  18+ base
                </Badge>
              ) : null}
            </span>
          </span>
          <BcsBadge value={a.bcs} />
          <span>
            {fmtDollars(a.dollars)}{" "}
            <span className="text-[11px] text-muted-foreground">({Math.round(a.pct)}%)</span>
          </span>
          <span className="num tabular-nums text-muted-foreground">
            {a.ch.isRmMeasured ? `${Math.round(a.ch.reachPct * 100)}%` : "—"}
          </span>
          <span className="num tabular-nums text-muted-foreground">{a.ch.attn}s</span>
        </div>
      ))}
    </div>
  );
}
