import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type ReceivablesSummaryStripProps = {
  totalToBill: number
  billed: number
  outstanding: number
  loading?: boolean
  className?: string
}

function KpiCard({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-28 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatAUD(value)}</p>
      )}
    </div>
  )
}

export function ReceivablesSummaryStrip({
  totalToBill,
  billed,
  outstanding,
  loading,
  className,
}: ReceivablesSummaryStripProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      <KpiCard label="Total to bill" value={totalToBill} loading={loading} />
      <KpiCard label="Billed" value={billed} loading={loading} />
      <KpiCard label="Outstanding" value={outstanding} loading={loading} />
    </div>
  )
}
