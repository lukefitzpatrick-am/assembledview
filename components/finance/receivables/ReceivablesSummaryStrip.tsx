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
    <div className="rounded-card border border-border bg-card p-4 shadow-e1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-28 animate-pulse rounded-input bg-surface-panel" />
      ) : (
        <p className="num mt-2 text-2xl font-bold text-foreground">{formatAUD(value)}</p>
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
