"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import Image from "next/image"
import Link from "next/link"

import { BrandLoading } from "@/components/brand/BrandLoading"
import { ClientMark, PublisherMark } from "@/components/brand/EntityMark"
import { MediaChannelTag } from "@/components/dashboard/MediaChannelTag"
import { StatTile } from "@/components/finance/sections/StatTile"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { Section } from "@/components/layout/Section"
import { navChipClass } from "@/components/layout/navChip"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { StatusPill } from "@/components/ui/status-pill"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MetricCard } from "@/components/ui/MetricCard"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import { Switch } from "@/components/ui/switch"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  BILLING_STATE,
  CAMPAIGN_PHASE,
  CODEX_TASK_STATUS,
  LIVE_PULSE,
  PACING_UI_STATUS,
  TASK_PRIORITY,
  XERO_DRAFT_MATCH,
  XERO_MATCH_STATUS,
  type Tone,
} from "@/lib/design/status"
import { getMediaLabel } from "@/lib/charts/registry"
import { BRAND } from "@/lib/brand"
import { DIVERGING, SEQUENTIAL, STATUS } from "@/lib/chart-theme"
import {
  BRAND_SERIES,
  MEDIA_FAMILY,
  MEDIA_TYPE_FAMILY,
  type MediaFamily,
  type MediaTypeThemeKey,
} from "@/lib/design/mediaFamilies"

const MEDIA_FAMILY_ORDER = Object.keys(MEDIA_FAMILY) as MediaFamily[]

const BRAND_SERIES_LABELS = [
  "Forest",
  "Sky",
  "Lime",
  "Forest light",
  "Muted",
  "Context",
  "Muted on black",
  "Context black",
] as const

const SEQUENTIAL_LABELS = [
  "Sand",
  "Step 2",
  "Step 3",
  "Step 4",
  "Forest light",
  "Forest",
  "Ink",
] as const

const DIVERGING_LABELS = [
  "Coral",
  "Step 2",
  "Step 3",
  "Sand",
  "Step 5",
  "Step 6",
  "Forest",
] as const

const STATUS_SWATCHES: Array<{ key: keyof typeof STATUS; label: string }> = [
  { key: "ahead", label: "Ahead" },
  { key: "onTrack", label: "On track" },
  { key: "behind", label: "Behind" },
  { key: "critical", label: "Critical" },
]

function mediaTypeLabels(family: MediaFamily): string[] {
  return (Object.entries(MEDIA_TYPE_FAMILY) as Array<[MediaTypeThemeKey, MediaFamily]>)
    .filter(([, member]) => member === family)
    .map(([key]) => getMediaLabel(key))
}

function Swatch({ colour, label }: { colour: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-6 shrink-0 rounded-input border border-foreground/15"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      <span className="text-sm text-foreground">{label}</span>
    </div>
  )
}

function SwatchRow({
  title,
  items,
}: {
  title: string
  items: ReadonlyArray<{ colour: string; label: string }>
}) {
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {items.map((item) => (
          <Swatch key={`${title}-${item.label}`} colour={item.colour} label={item.label} />
        ))}
      </div>
    </div>
  )
}

const BUTTON_VARIANTS: NonNullable<ButtonProps["variant"]>[] = [
  "default",
  "action",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
  "success",
  "warning",
]

const BADGE_VARIANTS: NonNullable<BadgeProps["variant"]>[] = [
  "default",
  "success",
  "ahead",
  "good",
  "info",
  "on-track",
  "warning",
  "behind",
  "attention",
  "danger",
  "critical",
  "blocking",
  "secondary",
  "destructive",
  "outline",
  "interactive",
  "outcome",
  "insight",
  "action",
  "neutral",
  "ink",
  "cancelled",
]

function statusRow(
  title: string,
  map: Record<string, { tone: Tone; label: string }>,
  pulseKey?: string,
) {
  return {
    title,
    entries: Object.entries(map).map(([key, value]) => ({
      key,
      tone: value.tone,
      label: value.label,
      pulse: pulseKey === key && LIVE_PULSE,
    })),
  }
}

const STATUS_ROWS = [
  statusRow("Pacing", PACING_UI_STATUS),
  statusRow("Campaign", CAMPAIGN_PHASE, "live"),
  statusRow("Billing", BILLING_STATE),
  statusRow("In-Xero match", XERO_DRAFT_MATCH),
  statusRow("Xero match", XERO_MATCH_STATUS),
  statusRow("Task status", CODEX_TASK_STATUS),
  statusRow("Task priority", TASK_PRIORITY),
]

const NAV_CHIPS = ["Overview", "Invoicing", "Pacing", "Knowledge"] as const

const EXAMPLE_ROWS = [
  { campaign: "Spring launch", client: "Example Co", channel: "Search", amount: "12,400" },
  { campaign: "Always on", client: "Northwind", channel: "Social", amount: "8,150" },
  { campaign: "Retail burst", client: "Example Co", channel: "BVOD", amount: "21,000" },
  { campaign: "Brand film", client: "Contoso", channel: "Television", amount: "46,800" },
]

type ExampleCampaign = {
  id: string
  client: string
  campaign: string
  mba: string
  status: string
  budget: number
  endDate: Date
}

const EXAMPLE_CAMPAIGNS: ExampleCampaign[] = [
  { id: "ex-1", client: "Northwind", campaign: "Always on", mba: "NW-014", status: "Live", budget: 8150, endDate: new Date(2026, 10, 30) },
  { id: "ex-2", client: "Example Co", campaign: "Spring launch", mba: "EX-102", status: "Booked", budget: 12400, endDate: new Date(2026, 8, 18) },
  { id: "ex-3", client: "Contoso", campaign: "Brand film", mba: "CO-008", status: "Live", budget: 46800, endDate: new Date(2026, 11, 12) },
  { id: "ex-4", client: "Example Co", campaign: "Retail burst", mba: "EX-118", status: "Completed", budget: 21000, endDate: new Date(2026, 5, 2) },
  { id: "ex-5", client: "Fabrikam", campaign: "Search always on", mba: "FB-221", status: "Live", budget: 6400, endDate: new Date(2027, 0, 31) },
  { id: "ex-6", client: "Adventure Works", campaign: "Summer OOH", mba: "AW-044", status: "Booked", budget: 33250, endDate: new Date(2026, 7, 9) },
  { id: "ex-7", client: "Northwind", campaign: "BVOD burst", mba: "NW-019", status: "Draft", budget: 15775, endDate: new Date(2026, 9, 4) },
  { id: "ex-8", client: "Wide World", campaign: "Social always on", mba: "WW-303", status: "Live", budget: 9800, endDate: new Date(2026, 6, 21) },
]

const EXAMPLE_CAMPAIGN_COLUMNS: DataTableColumn<ExampleCampaign>[] = [
  { id: "client", header: "Client", accessor: (row) => row.client },
  { id: "campaign", header: "Campaign", accessor: (row) => row.campaign },
  { id: "mba", header: "MBA", accessor: (row) => row.mba, sortable: false },
  { id: "status", header: "Status", accessor: (row) => row.status },
  {
    id: "budget",
    header: "Budget",
    accessor: (row) => row.budget,
    align: "right",
    cell: (row) => row.budget.toLocaleString("en-AU"),
  },
  { id: "endDate", header: "End date", accessor: (row) => row.endDate },
]

export default function DesignSystemPage() {
  const [segment, setSegment] = useState("cards")

  return (
    <PageShell width="standard">
      <PageHeader
        title="Design system"
        lede="Example components for review. Nothing on this page is live data."
      />

      <Section
        title="Page header"
        description="Example titles. A full stop is added unless the text already ends in one."
      >
        <div className="space-y-8">
          <PageHeader title="Campaigns" />
          <PageHeader title="Finance" accent="in one place" />
          <PageHeader
            title="Pacing"
            lede="Example lede under the title, held to the reading measure."
            meta={
              <>
                <span>Example</span>
                <span>FY26</span>
              </>
            }
            actions={
              <Button type="button">Example action</Button>
            }
          />
        </div>
      </Section>

      <Section title="Buttons" description="Every variant at default and small, plus the icon size.">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] text-muted-foreground">Default</p>
            <div className="flex flex-wrap gap-2">
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} type="button" variant={variant}>
                  {variant}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] text-muted-foreground">Small</p>
            <div className="flex flex-wrap gap-2">
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} type="button" variant={variant} size="sm">
                  {variant}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] text-muted-foreground">Icon</p>
            <div className="flex flex-wrap gap-2">
              {BUTTON_VARIANTS.map((variant) => (
                <Button
                  key={variant}
                  type="button"
                  variant={variant}
                  size="icon"
                  aria-label={`Example ${variant}`}
                >
                  <Plus />
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Badges" description="Every badge variant. Example labels only.">
        <div className="flex flex-wrap gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Status" description="Every status map. Live pulses.">
        <div className="space-y-4">
          {STATUS_ROWS.map((row) => (
            <div key={row.title}>
              <p className="mb-2 text-[13px] text-muted-foreground">{row.title}</p>
              <div className="flex flex-wrap gap-2">
                {row.entries.map((entry) => (
                  <StatusPill
                    key={entry.key}
                    tone={entry.tone}
                    label={entry.label}
                    pulse={entry.pulse}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Entity marks"
        description="Client and publisher colour paints only the mark. Invalid colour falls back to context."
      >
        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">Logo</p>
            <ClientMark name="Assembled Media" logoUrl="/brand/logo-full-colour.png" size="lg" nameVisible={false} />
          </div>
          {(["sm", "md", "lg"] as const).map((size) => (
            <div key={size} className="space-y-2">
              <p className="text-[13px] text-muted-foreground">{size}</p>
              <div className="flex items-center gap-2">
                <ClientMark name="Lime Co" colour={BRAND.colour.lime} size={size} nameVisible={false} />
                <ClientMark name="Forest Co" colour={BRAND.colour.forest} size={size} nameVisible={false} />
                <ClientMark name="Sky Co" colour={BRAND.colour.sky} size={size} nameVisible={false} />
                <ClientMark name="Bad Co" colour="not-a-colour" size={size} nameVisible={false} />
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">Publisher</p>
            <PublisherMark name="North Shore" colour={BRAND.colour.forest} size="md" nameVisible={false} />
          </div>
        </div>
      </Section>

      <Section
        title="Brand assets"
        description="Logos, the dot mark, and the loading state. The sign-in page is the live layout."
      >
        <div className="flex flex-wrap items-end gap-8">
          <div className="space-y-2 rounded-card bg-am-white p-4">
            <p className="text-[13px] text-muted-foreground">Full colour</p>
            <Image
              src="/brand/logo-full-colour.png"
              alt="Assembled Media"
              width={1000}
              height={148}
              className="h-auto w-[200px]"
            />
          </div>
          <div className="space-y-2 rounded-card bg-am-ink p-4">
            <p className="text-[13px] text-am-muted-on-black">Inverted</p>
            <Image
              src="/brand/logo-inverted-white.png"
              alt=""
              width={1000}
              height={148}
              className="h-auto w-[200px]"
            />
          </div>
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">Dot mark</p>
            <Image src="/brand/dot-mark-lime.svg" alt="" width={48} height={48} />
          </div>
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">Favicon</p>
            <Image src="/brand/icon-512.png" alt="" width={48} height={48} />
          </div>
          <BrandLoading text="Loading AssembledView." />
        </div>
        <p className="mt-4 text-sm">
          <Link href="/" className="underline-offset-4 hover:underline">
            Sign-in page
          </Link>
        </p>
      </Section>

      <Section
        title="Media types"
        description="Seven channel families. The pill is neutral. The dot is the family colour."
      >
        <div className="space-y-4">
          {MEDIA_FAMILY_ORDER.map((family) => (
            <div key={family} className="flex flex-wrap items-center gap-3">
              <p className="w-56 text-sm text-foreground">{MEDIA_FAMILY[family].label}</p>
              <div className="flex flex-wrap gap-1.5">
                {mediaTypeLabels(family).map((label) => (
                  <MediaChannelTag key={`${family}-${label}`} label={label} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Chart palette"
        description="Brand series, sequential and diverging ramps, and status colours."
      >
        <div className="space-y-6">
          <SwatchRow
            title="Brand series"
            items={BRAND_SERIES.map((colour, index) => ({
              colour,
              label: BRAND_SERIES_LABELS[index] ?? `Series ${index + 1}`,
            }))}
          />
          <SwatchRow
            title="Sequential"
            items={SEQUENTIAL.map((colour, index) => ({
              colour,
              label: SEQUENTIAL_LABELS[index] ?? `Step ${index + 1}`,
            }))}
          />
          <SwatchRow
            title="Diverging"
            items={DIVERGING.map((colour, index) => ({
              colour,
              label: DIVERGING_LABELS[index] ?? `Step ${index + 1}`,
            }))}
          />
          <SwatchRow
            title="Status"
            items={STATUS_SWATCHES.map((item) => ({
              colour: STATUS[item.key],
              label: item.label,
            }))}
          />
        </div>
      </Section>

      <Section title="Nav chips" description="Four example chips. Overview is the active one.">
        <div className="flex flex-wrap gap-2">
          {NAV_CHIPS.map((label) => (
            <button key={label} type="button" className={navChipClass(label === "Overview")}>
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Cards" description="Example card with a header and body.">
        <Card>
          <CardHeader>
            <CardTitle>Example card</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Example body copy for the card primitive.
            </p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Stat tiles" description="Example figures. StatTile ready, loading, error and empty, then a medium MetricCard.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Ready"
            basisCaption="Example · this month"
            state={{ status: "ready", cents: 240000 }}
          />
          <StatTile
            label="Loading"
            basisCaption="Example · this month"
            state={{ status: "loading" }}
          />
          <StatTile
            label="Error"
            basisCaption="Example · this month"
            state={{ status: "error", message: "Example error" }}
          />
          <StatTile
            label="Empty"
            basisCaption="Example · this month"
            state={{ status: "empty" }}
          />
          <MetricCard label="Example reach" value={18420} size="md" />
        </div>
      </Section>

      <Section title="Table" description="Four example rows.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {EXAMPLE_ROWS.map((row) => (
              <TableRow key={row.campaign}>
                <TableCell>{row.campaign}</TableCell>
                <TableCell>{row.client}</TableCell>
                <TableCell>{row.channel}</TableCell>
                <TableCell className="num text-right">{row.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Data table"
        description="Example data. Eight campaigns. MBA does not sort."
      >
        <DataTable
          columns={EXAMPLE_CAMPAIGN_COLUMNS}
          rows={EXAMPLE_CAMPAIGNS}
          getRowId={(row) => row.id}
          csvFilename="example-campaigns"
          maxHeight="320px"
          caption="Example campaigns"
        />
      </Section>

      <Section title="Inputs" description="Example fields. Nothing here is submitted.">
        <div className="grid max-w-xl gap-4">
          <label className="grid gap-1.5 text-sm text-foreground">
            Example name
            <Input placeholder="Example name" />
          </label>
          <label className="grid gap-1.5 text-sm text-foreground">
            Example notes
            <Textarea placeholder="Example notes" />
          </label>
          <div className="grid gap-1.5 text-sm text-foreground">
            <span id="example-channel-label">Example channel</span>
            <Select defaultValue="search">
              <SelectTrigger aria-labelledby="example-channel-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="search">Search</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="bvod">BVOD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch defaultChecked aria-label="Example notifications" />
            <span className="text-sm text-foreground">Example notifications</span>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm text-foreground">Example layout</span>
            <Segmented
              value={segment}
              onValueChange={(value) => {
                if (value) setSegment(value)
              }}
              aria-label="Example layout"
            >
              <SegmentedItem value="cards">Cards</SegmentedItem>
              <SegmentedItem value="table">Table</SegmentedItem>
            </Segmented>
          </div>
        </div>
      </Section>
    </PageShell>
  )
}
