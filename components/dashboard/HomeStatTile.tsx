import { cn } from "@/lib/utils"

export function HomeStatTile({
  label,
  value,
  detail,
  platformDelivery,
}: {
  label: string
  value: string
  detail?: { dotClass: string; text: string } | null
  /** Beside the start-window line. Hidden when the portfolio count is missing. */
  platformDelivery?: string | null
}) {
  return (
    <div className="flex h-full flex-col rounded-card bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-2 text-[28px] font-extrabold leading-none text-am-forest">{value}</p>
      {detail || platformDelivery ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-secondary">
          {detail ? (
            <span className="inline-flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", detail.dotClass)} aria-hidden />
              {detail.text}
            </span>
          ) : null}
          {platformDelivery ? <span>{platformDelivery}</span> : null}
        </p>
      ) : null}
    </div>
  )
}
