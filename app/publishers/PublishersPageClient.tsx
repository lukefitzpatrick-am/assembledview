"use client"

import { useState, useEffect, useMemo, type CSSProperties } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PlusCircle, Edit, X, Building2 } from "lucide-react"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { AddPublisherForm } from "@/components/AddPublisherForm"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useListGridLayoutPreference } from "@/lib/hooks/useListGridLayoutPreference"
import { ListGridToggle } from "@/components/ui/list-grid-toggle"
import { CSVExportButton } from "@/components/ui/csv-export-button"
import { Panel, PanelActions, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import type { Publisher } from "@/lib/types/publisher"
import { publisherHubPath } from "@/lib/publisher/publisherHubPath"
import { MEDIA_TYPE_SLUG_TO_DASHBOARD_LABEL } from "@/lib/publisher/scheduleLabels"
import { MediaChannelTag, mediaChannelTagRowClassName } from "@/components/dashboard/MediaChannelTag"

const normalizePublisherFilterKey = (value: string) =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")

const MEDIA_TYPES = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digidisplay",
  "digiaudio",
  "digivideo",
  "bvod",
  "integration",
  "search",
  "socialmedia",
  "progdisplay",
  "progvideo",
  "progbvod",
  "progaudio",
  "progooh",
  "influencers",
] as const

const PRIMARY_FALLBACK = "hsl(var(--primary))"

function isSixDigitHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s)
}

function cardAccentColour(publisher: Publisher): string {
  const c = publisher.publisher_colour?.trim()
  return c && c.length > 0 ? c : PRIMARY_FALLBACK
}

function topStripeStyle(colour: string): CSSProperties {
  if (isSixDigitHex(colour)) {
    return {
      background: `linear-gradient(to right, ${colour}, ${colour}B3, ${colour}66)`,
    }
  }
  return {
    background:
      "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary) / 0.7), hsl(var(--primary) / 0.4))",
  }
}

function publisherTypeLabel(type: Publisher["publishertype"]): string {
  return type === "internal_biddable" ? "Internal biddable" : "Direct"
}

function publisherInitials(name: string): string {
  const t = name.trim()
  if (t.length === 0) return "??"
  if (t.length === 1) return t.toUpperCase()
  return (t[0] + t[1]).toUpperCase()
}

function publisherMediaTypeLabels(publisher: Publisher): string[] {
  return MEDIA_TYPES.filter((type) => publisher[`pub_${type}` as keyof Publisher]).map(
    (type) => MEDIA_TYPE_SLUG_TO_DASHBOARD_LABEL[type] ?? type
  )
}

function listMediaTypeBadges(publisher: Publisher) {
  const labels = publisherMediaTypeLabels(publisher)
  const visible = labels.slice(0, 4)
  const more = labels.length - visible.length
  return (
    <>
      {visible.map((label) => (
        <MediaChannelTag key={label} label={label} />
      ))}
      {more > 0 ? (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          +{more}
        </span>
      ) : null}
    </>
  )
}

function PublisherGridCard({ publisher }: { publisher: Publisher }) {
  const [hover, setHover] = useState(false)
  const colour = cardAccentColour(publisher)
  const rawStoredColour = publisher.publisher_colour?.trim() ?? ""
  const hexAccent = rawStoredColour && isSixDigitHex(rawStoredColour) ? rawStoredColour : null

  const allLabels = publisherMediaTypeLabels(publisher)
  const visibleLabels = allLabels.slice(0, 6)
  const moreCount = allLabels.length - visibleLabels.length

  const borderStyle: CSSProperties | undefined =
    hover && hexAccent ? { borderColor: `${hexAccent}4D` } : undefined

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:shadow-md",
        !hexAccent && "hover:border-primary/30"
      )}
      style={borderStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="h-[3px] shrink-0" style={topStripeStyle(colour)} />

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              !hexAccent && "bg-primary/10 text-primary"
            )}
            style={
              hexAccent
                ? {
                    backgroundColor: `${hexAccent}15`,
                    color: hexAccent,
                  }
                : undefined
            }
            aria-hidden
          >
            {publisherInitials(publisher.publisher_name || "")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-snug">{publisher.publisher_name}</p>
            <p className="truncate text-xs text-muted-foreground">{publisher.publisherid}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {publisherTypeLabel(publisher.publishertype)}
            </p>
          </div>
        </div>

        <div className="mt-3 border-t border-border/30 pt-3">
          <div className={mediaChannelTagRowClassName}>
            {visibleLabels.map((label) => (
              <MediaChannelTag key={label} label={label} />
            ))}
            {moreCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                +{moreCount} more
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex justify-end border-t border-border/30 pt-3">
          <Button variant="outline" size="sm" asChild className="whitespace-nowrap">
            <Link href={publisherHubPath(publisher)}>
              <Edit className="mr-2 h-4 w-4" />
              Open hub
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PublishersPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const publisherFilter = searchParams?.get("publisher")?.trim() || ""
  const { mode: listGridMode, setMode: setListGridMode } = useListGridLayoutPreference()

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [publishers, setPublishers] = useState<Publisher[]>([])

  useEffect(() => {
    void fetchPublishers()
  }, [])

  async function fetchPublishers() {
    try {
      const response = await fetch("/api/publishers")
      if (!response.ok) {
        throw new Error("Failed to fetch publishers")
      }
      const data = await response.json()
      setPublishers(data)
    } catch (error) {
      console.error("Error fetching publishers:", error)
    }
  }

  const filteredPublishers = useMemo(() => {
    if (!publisherFilter) return publishers
    const key = normalizePublisherFilterKey(publisherFilter)
    if (!key) return publishers
    return publishers.filter((p) => normalizePublisherFilterKey(p.publisher_name || "") === key)
  }, [publishers, publisherFilter])

  const matchedRecord = useMemo(() => {
    if (!publisherFilter) return null
    const key = normalizePublisherFilterKey(publisherFilter)
    if (!key) return null
    return publishers.find((p) => normalizePublisherFilterKey(p.publisher_name || "") === key) ?? null
  }, [publishers, publisherFilter])

  const csvData = filteredPublishers.map((publisher) => {
    const activeMediaTypes = publisherMediaTypeLabels(publisher).join("; ")

    return {
      publisher_name: publisher.publisher_name,
      publisherid: publisher.publisherid,
      media_types: activeMediaTypes,
    }
  })

  const csvHeaders = {
    publisher_name: "Publisher Name",
    publisherid: "Publisher ID",
    media_types: "Media Types",
  }

  const showFilterChip = Boolean(publisherFilter)

  return (
    <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-0 md:px-6">
      <MediaPlanEditorHero
        className="mb-2 pt-6 md:pt-8"
        title="Publishers"
        Icon={Building2}
        detail={
          <p>
            Browse the directory and jump into a publisher to edit details and review performance.
          </p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ListGridToggle value={listGridMode} onChange={setListGridMode} />
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-fit shadow-sm">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Publisher
                </Button>
              </DialogTrigger>
              <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
                <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  <DialogHeader>
                    <DialogTitle>Add New Publisher</DialogTitle>
                  </DialogHeader>
                  <AddPublisherForm
                    onSuccess={() => {
                      setIsAddDialogOpen(false)
                      void fetchPublishers()
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Panel className="border-border/40 shadow-sm">
        <PanelContent standalone className="py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {showFilterChip ? (
                <div
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-3 pr-1 py-1 text-sm text-foreground"
                  role="status"
                  aria-label={`Filtered by publisher: ${publisherFilter}`}
                >
                  <span className="max-w-[min(100%,20rem)] truncate">
                    <span className="text-muted-foreground">Publisher · </span>
                    {publisherFilter}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-7 w-7 shrink-0 rounded-full after:absolute after:-inset-2 after:rounded-full after:content-['']"
                    asChild
                  >
                    <Link href="/publishers" aria-label="Clear publisher filter and show all publishers">
                      <X className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {publishers.length.toLocaleString("en-AU")} total
                </span>
              )}
            </div>
          </div>
        </PanelContent>
      </Panel>

      {showFilterChip && matchedRecord ? (
        <p className="text-sm text-muted-foreground">
          Matched directory record.{" "}
          <Link href={publisherHubPath(matchedRecord)} className="font-medium text-foreground underline-offset-4 hover:underline">
            Open publisher detail
          </Link>
          .
        </p>
      ) : null}

      {showFilterChip && !matchedRecord && publishers.length > 0 ? (
        <p className="text-sm text-status-warning">
          No directory row matches this billing name exactly. Clear the filter to browse all publishers, or add a matching record.
        </p>
      ) : null}

      <Panel className="overflow-hidden border-border/40 shadow-sm">
        <PanelHeader className="border-b border-border/40 pb-3 bg-muted/20">
          <div className="space-y-1">
            <PanelTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Directory</PanelTitle>
            <PanelDescription className="text-xs">
              {filteredPublishers.length.toLocaleString("en-AU")} of {publishers.length.toLocaleString("en-AU")} publishers
              {showFilterChip ? " (filtered)" : ""}.
            </PanelDescription>
          </div>
          <PanelActions>
            <CSVExportButton data={csvData} filename="publishers.csv" headers={csvHeaders} buttonText="Export CSV" />
          </PanelActions>
        </PanelHeader>
        <PanelContent className="px-0 pb-0 pt-0">
          {listGridMode === "list" ? (
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow className="hover:bg-muted/20">
                  <TableHead className="w-[40px] p-2" />
                  <TableHead className="min-w-0 text-foreground">Publisher</TableHead>
                  <TableHead className="w-[14%]">ID</TableHead>
                  <TableHead className="w-[11rem] whitespace-nowrap">Type</TableHead>
                  <TableHead>Media types</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                {filteredPublishers.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {showFilterChip
                        ? "No publishers match this filter."
                        : publishers.length === 0
                          ? "No publishers loaded."
                          : "No rows to display."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPublishers.map((publisher) => {
                    const hubHref = publisherHubPath(publisher)
                    const dotColour = publisher.publisher_colour?.trim()
                    return (
                      <TableRow
                        key={publisher.id}
                        className="cursor-pointer border-b border-border/20 transition-colors duration-100 hover:bg-muted/30"
                        onClick={() => router.push(hubHref)}
                      >
                        <TableCell className="w-[40px] p-2 align-middle">
                          <div className="flex justify-center">
                            <div
                              className={cn(
                                "h-2.5 w-2.5 shrink-0 rounded-full",
                                !dotColour && "bg-muted-foreground/20"
                              )}
                              style={dotColour ? { backgroundColor: dotColour } : undefined}
                              aria-hidden
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-1 shrink-0 self-stretch rounded-full"
                              style={{ backgroundColor: publisher.publisher_colour || "transparent" }}
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <div className="truncate">{publisher.publisher_name}</div>
                              <div className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                                ID {publisher.publisherid}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{publisher.publisherid}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-medium normal-case">
                            {publisherTypeLabel(publisher.publishertype)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className={mediaChannelTagRowClassName}>{listMediaTypeBadges(publisher)}</div>
                        </TableCell>
                        <TableCell
                          className="relative z-10 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm" asChild className="h-8 whitespace-nowrap text-xs">
                            <Link href={hubHref}>
                              <Edit className="mr-2 h-4 w-4" />
                              Open hub
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          ) : filteredPublishers.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              {showFilterChip
                ? "No publishers match this filter."
                : publishers.length === 0
                  ? "No publishers loaded."
                  : "No rows to display."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredPublishers.map((publisher) => (
                <PublisherGridCard key={publisher.id} publisher={publisher} />
              ))}
            </div>
          )}
        </PanelContent>
      </Panel>
    </div>
  )
}
