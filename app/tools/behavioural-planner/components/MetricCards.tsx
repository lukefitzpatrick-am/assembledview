interface MetricCardsProps {
  reach: number; // 0-100
  attentionSeconds: number; // average aAPM across mix
  effectiveCpm: number;
  audienceMillions: number;
}

function fmtAudience(m: number): string {
  if (m < 0.1) return `${Math.round(m * 1000)}k`;
  if (m < 1) return `${Math.round(m * 1000)}k`;
  return `${m.toFixed(1)}M`;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function MetricCards({
  reach,
  attentionSeconds,
  effectiveCpm,
  audienceMillions,
}: MetricCardsProps) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
      <Card label="Reach of target" value={`${Math.round(reach)}%`} />
      <Card label="Attention seconds" value={`${attentionSeconds.toFixed(1)}s`} />
      <Card label="Effective CPM" value={`$${Math.round(effectiveCpm)}`} />
      <Card label="Audience size" value={fmtAudience(audienceMillions)} />
    </div>
  );
}
