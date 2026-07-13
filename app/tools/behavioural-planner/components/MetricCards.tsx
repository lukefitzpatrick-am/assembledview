interface MetricCardsProps {
  reach: number; // 0-100 mix-weighted real reach %
  attentionSeconds: number;
  effectiveCpm: number;
  /** Population weighted count in '000s (audience_wc). */
  audienceWc: number;
}

/** Format audience_wc ('000s) — same units as Snowsight / reach profile. */
function fmtAudienceWc(wc: number): string {
  return `${wc.toLocaleString("en-AU", { maximumFractionDigits: 1 })}k`;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="num text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function MetricCards({
  reach,
  attentionSeconds,
  effectiveCpm,
  audienceWc,
}: MetricCardsProps) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
      <Card label="Reach of target" value={`${Math.round(reach)}%`} />
      <Card label="Attention seconds" value={`${attentionSeconds.toFixed(1)}s`} />
      <Card label="Effective CPM" value={`$${Math.round(effectiveCpm)}`} />
      <Card label="Audience size" value={fmtAudienceWc(audienceWc)} />
    </div>
  );
}
