import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type CampaignInfoHeaderProps = {
  campaign: any
  className?: string
}

function parseCurrency(value: any, currency = "AUD") {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9.-]+/g, "")) || 0
        : 0
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDate(value: any) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

function InfoChip({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-foreground ring-1 ring-muted">
      <span className="text-muted-foreground">{label}</span>
      <Separator orientation="vertical" className="h-4" />
      <span className="leading-none">{value}</span>
    </span>
  )
}

const mediaTypeLabels: Record<string, string> = {
  mp_television: "Television",
  mp_radio: "Radio",
  mp_newspaper: "Newspaper",
  mp_magazines: "Magazines",
  mp_ooh: "OOH",
  mp_cinema: "Cinema",
  mp_digidisplay: "Digital Display",
  mp_digiaudio: "Digital Audio",
  mp_digivideo: "Digital Video",
  mp_bvod: "BVOD",
  mp_integration: "Integration",
  mp_search: "Search",
  mp_socialmedia: "Social Media",
  mp_progdisplay: "Programmatic Display",
  mp_progvideo: "Programmatic Video",
  mp_progbvod: "Programmatic BVOD",
  mp_progaudio: "Programmatic Audio",
  mp_progooh: "Programmatic OOH",
  mp_influencers: "Influencers",
  mp_production: "Production",
}

const mediaTypeClasses: Record<string, string> = {
  Television: "bg-blue-100 text-blue-800 ring-blue-200",
  Radio: "bg-amber-100 text-amber-800 ring-amber-200",
  Newspaper: "bg-stone-200 text-stone-900 ring-stone-300",
  Magazines: "bg-pink-100 text-pink-800 ring-pink-200",
  OOH: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Cinema: "bg-rose-100 text-rose-800 ring-rose-200",
  "Digital Display": "bg-sky-100 text-sky-800 ring-sky-200",
  "Digital Audio": "bg-teal-100 text-teal-800 ring-teal-200",
  "Digital Video": "bg-indigo-100 text-indigo-800 ring-indigo-200",
  BVOD: "bg-purple-100 text-purple-800 ring-purple-200",
  Integration: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
  Search: "bg-orange-100 text-orange-800 ring-orange-200",
  "Social Media": "bg-blue-100 text-blue-800 ring-blue-200",
  "Programmatic Display": "bg-cyan-100 text-cyan-800 ring-cyan-200",
  "Programmatic Video": "bg-violet-100 text-violet-800 ring-violet-200",
  "Programmatic BVOD": "bg-purple-100 text-purple-800 ring-purple-200",
  "Programmatic Audio": "bg-lime-100 text-lime-800 ring-lime-200",
  "Programmatic OOH": "bg-green-100 text-green-800 ring-green-200",
  Influencers: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  Production: "bg-slate-200 text-slate-900 ring-slate-300",
}

function isTruthyFlag(value: any) {
  if (value === undefined || value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["yes", "true", "1", "y"].includes(normalized)
  }
  return false
}

function resolveClientName(campaign: any): string {
  const client = campaign?.client
  if (client && typeof client === "object") {
    return (
      client.name ||
      client.client_name ||
      client.clientName ||
      client.client_name_display ||
      client.mp_client_name ||
      client.mpClientName ||
      ""
    )
  }
  return (
    client ||
    campaign?.client_name ||
    campaign?.mp_client_name ||
    campaign?.clientName ||
    campaign?.client_name_display ||
    ""
  )
}

export default function CampaignInfoHeader({ campaign, className }: CampaignInfoHeaderProps) {
  const name =
    campaign?.campaign_name ||
    campaign?.mp_campaignname ||
    campaign?.campaignName ||
    campaign?.name ||
    "Campaign"

  const brand = campaign?.campaign_brand || campaign?.brand || campaign?.mp_brand || ""
  const mba =
    campaign?.mbaNumber || campaign?.mba_number || campaign?.mp_mbanumber || campaign?.mp_mba_number || ""
  const client = resolveClientName(campaign)

  const status = campaign?.status || campaign?.campaign_status || campaign?.mp_campaign_status || "Active"
  const budget =
    campaign?.campaign_budget ||
    campaign?.mp_campaignbudget ||
    campaign?.total_budget ||
    campaign?.total_media ||
    campaign?.totalMedia ||
    0

  const planVersion =
    campaign?.versionNumber || campaign?.version_number || campaign?.media_plan_version || campaign?.mp_plannumber
  const planDate = campaign?.plan_date || campaign?.created_at || campaign?.date || campaign?.updated_at
  const poNumber = campaign?.po_number || campaign?.poNumber || campaign?.purchase_order_number
  const contact = campaign?.client_contact || campaign?.contact_name || campaign?.contactName

  const mediaTypes = Object.entries(mediaTypeLabels)
    .filter(([key]) => isTruthyFlag((campaign as any)?.[key]))
    .map(([, label]) => label)

  return (
    <Card className={cn("relative rounded-3xl border-muted/70 bg-background/90 shadow-sm", className)}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-[28px] font-semibold leading-tight md:text-[32px]">{name}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-muted-foreground">
              {brand ? <span className="font-medium text-foreground">{brand}</span> : null}
              {brand && mba ? <span className="text-muted-foreground/60">•</span> : null}
              {mba ? (
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] md:text-[12px]">
                  {mba}
                </Badge>
              ) : null}
              {(brand || mba) && client ? <span className="text-muted-foreground/60">•</span> : null}
              {client ? (
                <span className="font-medium text-foreground">{client}</span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge className="rounded-full bg-primary/15 px-4 py-2 text-[14px] md:text-[16px] font-semibold text-primary">
              {parseCurrency(budget)}
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-full px-4 py-2 text-[14px] md:text-[16px] font-semibold capitalize"
            >
              {status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-muted/60 bg-muted/10 px-3 py-2 text-sm md:text-base">
          <InfoChip label="Client Contact" value={contact} />
          <InfoChip label="Plan Version" value={planVersion} />
          <InfoChip label="Plan Date" value={formatDate(planDate)} />
          <InfoChip label="PO Number" value={poNumber} />
        </div>
      </CardContent>

      {mediaTypes.length ? (
        <div className="pointer-events-none absolute bottom-4 right-4 flex max-w-[60%] flex-wrap justify-end gap-2">
          {mediaTypes.map((label) => (
            <Badge
              key={label}
              variant="secondary"
              className={cn(
                "pointer-events-auto rounded-full px-3 py-1 text-[11px] font-semibold",
                mediaTypeClasses[label] ?? "bg-muted text-foreground ring-muted"
              )}
            >
              {label}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
