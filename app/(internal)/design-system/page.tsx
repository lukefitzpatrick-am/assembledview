"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { StatTile } from "@/components/finance/sections/StatTile"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { Section } from "@/components/layout/Section"
import { navChipClass } from "@/components/layout/navChip"
import { Badge, type BadgeProps } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

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
]

const NAV_CHIPS = ["Overview", "Invoicing", "Pacing", "Knowledge"] as const

const EXAMPLE_ROWS = [
  { campaign: "Spring launch", client: "Example Co", channel: "Search", amount: "12,400" },
  { campaign: "Always on", client: "Northwind", channel: "Social", amount: "8,150" },
  { campaign: "Retail burst", client: "Example Co", channel: "BVOD", amount: "21,000" },
  { campaign: "Brand film", client: "Contoso", channel: "Television", amount: "46,800" },
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
