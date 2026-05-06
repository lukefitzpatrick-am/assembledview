import { cn } from "@/lib/utils"
import { KpiTile, type KpiTileProps } from "./KpiTile"

export interface KpiBandProps {
  tiles: KpiTileProps[]
  /** Optional title, e.g. "Delivery KPIs" or "Efficiency metrics". */
  title?: string
  /** Optional subtitle. */
  subtitle?: string
  className?: string
}

export function KpiBand({ tiles, title, subtitle, className }: KpiBandProps) {
  if (!tiles.length) return null
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/50 p-4", className)}>
      {title || subtitle ? (
        <div className="mb-3">
          {title ? <p className="text-sm font-medium">{title}</p> : null}
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <KpiTile key={t.label} {...t} />
        ))}
      </div>
    </div>
  )
}
