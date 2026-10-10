import { cn } from "@/lib/utils"

export function HomeStatTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: { dotClass: string; text: string } | null
}) {
  return (
    <div className="flex h-full flex-col rounded-card bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-2 text-[28px] font-extrabold leading-none text-am-forest">{value}</p>
      {detail ? (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-text-secondary">
          <span className={cn("size-2 shrink-0 rounded-full", detail.dotClass)} aria-hidden />
          {detail.text}
        </p>
      ) : null}
    </div>
  )
}
