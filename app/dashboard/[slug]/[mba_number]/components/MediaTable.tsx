"use client"

import { useMemo, useState, Fragment } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { format } from 'date-fns'
import { NormalisedLineItem, groupByLineItemId } from '@/lib/mediaplan/normalizeLineItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getMediaLabel, normalizeEntityKey } from '@/lib/charts/registry'
import { cn } from '@/lib/utils'
import { formatAUD } from '@/lib/format/money'
import { MediaChannelTag } from '@/components/dashboard/MediaChannelTag'
import { EmptyState } from '@/components/ui/states'
import { ProgressBar } from '@/components/ui/ProgressBar'

interface MediaTableProps {
  lineItems: Record<string, NormalisedLineItem[]>
}

type GroupedItem = {
  key: string
  lineItemId: string
  market?: string
  platform?: string
  network?: string
  station?: string
  site?: string
  publisher?: string
  title?: string
  targeting?: string
  buyType?: string
  buyingDemo?: string
  totalMedia: number
  totalDeliverables: number
  groupStartDate: string
  groupEndDate: string
  bursts: NormalisedLineItem['bursts']
}

const mediaAccentClasses: Record<string, string> = {
  television: "bg-channel-tv",
  cinema: "bg-channel-tv",
  bvod: "bg-channel-bvod",
  prog_bvod: "bg-channel-bvod",
  prog_video: "bg-channel-bvod",
  digital_video: "bg-channel-bvod",
  social_media: "bg-channel-social",
  prog_display: "bg-channel-progDisplay",
  digital_display: "bg-channel-progDisplay",
  search: "bg-channel-search",
  ooh: "bg-channel-ooh",
}

function mediaAccentClassName(mediaType: string) {
  return mediaAccentClasses[normalizeEntityKey(mediaType)] ?? "bg-border"
}

function safeNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function groupLineItems(items: NormalisedLineItem[]): GroupedItem[] {
  if (!items || items.length === 0) return []

  return items.map((item) => {
    const totalMedia = item.bursts.reduce((sum, burst) => sum + safeNumber(burst.deliverablesAmount || burst.budget), 0)
    const totalDeliverables = item.bursts.reduce((sum, burst) => sum + safeNumber(burst.deliverables), 0)

    const startDates = item.bursts.map((b) => b.startDate).filter(Boolean)
    const endDates = item.bursts.map((b) => b.endDate).filter(Boolean)
    const groupStartDate = startDates.length ? startDates.reduce((a, b) => (a < b ? a : b)) : ''
    const groupEndDate = endDates.length ? endDates.reduce((a, b) => (a > b ? a : b)) : ''

    return {
      key: item.lineItemId,
      lineItemId: item.lineItemId,
      market: item.market,
      platform: item.platform,
      network: item.network,
      station: item.station,
      site: item.site,
      publisher: item.publisher || item.platform || item.network || item.site || item.station,
      title: item.title,
      targeting: item.targeting,
      buyType: item.buyType,
      buyingDemo: item.buyingDemo,
      totalMedia,
      totalDeliverables,
      groupStartDate,
      groupEndDate,
      bursts: item.bursts,
    }
  })
}

export default function MediaTable({ lineItems }: MediaTableProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedMediaTypes, setExpandedMediaTypes] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'period' | 'budget' | 'deliverables'>('period')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedGroups(newExpanded)
  }

  const toggleMediaType = (mediaType: string) => {
    const next = new Set(expandedMediaTypes)
    if (next.has(mediaType)) next.delete(mediaType)
    else next.add(mediaType)
    setExpandedMediaTypes(next)
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return format(date, 'dd/MM/yyyy')
    } catch {
      return dateString
    }
  }

  const formatCurrency = (value: number | string | undefined) => {
    if (!value) return '$0.00'
    const num = typeof value === 'string' 
      ? parseFloat(value.replace(/[^0-9.-]+/g, '')) 
      : value
    return formatAUD(num || 0)
  }

  const groupedData = useMemo(() => {
    const result: Record<string, GroupedItem[]> = {}

    Object.entries(lineItems || {}).forEach(([mediaType, items]) => {
      if (Array.isArray(items) && items.length > 0) {
        const groupedItems = groupByLineItemId(items, mediaType)
        result[mediaType] = groupLineItems(groupedItems)
      }
    })

    const query = search.trim().toLowerCase()
    const filtered: Record<string, GroupedItem[]> = {}

    Object.entries(result).forEach(([mediaType, groups]) => {
      const sorted = [...groups].sort((a, b) => {
        const aPeriod = a.groupStartDate.localeCompare(b.groupStartDate)
        const budgetDelta = a.totalMedia - b.totalMedia
        const deliverableDelta = a.totalDeliverables - b.totalDeliverables
        const delta =
          sortBy === 'period' ? aPeriod : sortBy === 'budget' ? budgetDelta : deliverableDelta
        return sortDir === 'asc' ? delta : -delta
      })

      const filteredGroups = query
        ? sorted.filter((group) =>
            `${group.publisher || ''} ${group.title || ''} ${group.market || ''} ${group.targeting || ''}`
              .toLowerCase()
              .includes(query)
          )
        : sorted

      if (filteredGroups.length) filtered[mediaType] = filteredGroups
    })

    return filtered
  }, [lineItems, search, sortBy, sortDir])

  const hasLineItems = Object.values(lineItems).some(items => items && items.length > 0)

  if (!hasLineItems) {
    return (
      <EmptyState
        title="No media line items available"
        message="Add media line items to show campaign rows and burst pacing."
      />
    )
  }

  return (
    <TooltipProvider delayDuration={120}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setExpandedMediaTypes(new Set(Object.keys(groupedData)))}
        >
          Expand all
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setExpandedMediaTypes(new Set())}>
          Collapse all
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter rows..."
          className="h-8 w-full max-w-[240px]"
        />
      </div>

      {Object.keys(groupedData).length === 0 ? (
        <EmptyState
          title="No rows match the current filters"
          message="Clear or change the filter to show campaign rows."
        />
      ) : null}

      {Object.entries(groupedData).map(([mediaType, groups]) => {
        if (!groups || groups.length === 0) return null

        const displayName = getMediaLabel(mediaType)
        const totalSpend = groups.reduce((sum, group) => sum + group.totalMedia, 0)
        const totalItems = groups.reduce((sum, group) => sum + group.bursts.length, 0)
        const isTypeExpanded = expandedMediaTypes.has(mediaType)

        return (
          <div key={mediaType} className="space-y-2 rounded-card border border-border/60 bg-card shadow-e0">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-t-card bg-surface-panel px-3 py-2 text-left transition-colors hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => toggleMediaType(mediaType)}
            >
              <div className="flex items-center gap-2">
                <MediaChannelTag label={displayName} />
              </div>
              <Badge variant="outline" className="num">
                {groups.length} {groups.length === 1 ? 'group' : 'groups'} • {totalItems} {totalItems === 1 ? 'burst' : 'bursts'} • Total: {formatCurrency(totalSpend)}
              </Badge>
            </button>
            {isTypeExpanded ? (
            <div
              data-export="media-plan-table-scroll"
              className="max-h-[520px] overflow-auto rounded-b-card"
            >
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Market</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={() => {
                          setSortBy('period')
                          setSortDir((prev) => (sortBy === 'period' && prev === 'asc' ? 'desc' : 'asc'))
                        }}
                      >
                        Period
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={() => {
                          setSortBy('deliverables')
                          setSortDir((prev) => (sortBy === 'deliverables' && prev === 'asc' ? 'desc' : 'asc'))
                        }}
                      >
                        Deliverables
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={() => {
                          setSortBy('budget')
                          setSortDir((prev) => (sortBy === 'budget' && prev === 'asc' ? 'desc' : 'asc'))
                        }}
                      >
                        Gross Media
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </TableHead>
                    <TableHead>Bursts</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead colSpan={7} className="bg-surface-panel">
                      <div className="text-xs text-muted-foreground">Filter row active: {search ? `"${search}"` : 'none'}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group, groupIndex) => {
                    const details: string[] = []
                    const publisher = group.publisher || group.platform || group.network || group.site || group.station
                    const title = group.title && !/auto\s*allocation/i.test(group.title) ? group.title : undefined

                    if (publisher) details.push(publisher)
                    if (title) details.push(title)
                    if (group.targeting) details.push(`Targeting: ${group.targeting}`)
                    if (group.buyType) details.push(`Buy: ${group.buyType}`)
                    if (group.buyingDemo) details.push(`Demo: ${group.buyingDemo}`)

                    const groupKey = `${mediaType}-${group.key || groupIndex}`
                    const isExpanded = expandedGroups.has(groupKey)

                    return (
                      <Fragment key={groupKey}>
                        <TableRow
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-table-row-hover",
                            groupIndex % 2 === 1 && "bg-surface-panel"
                          )}
                          onClick={() => toggleGroup(groupKey)}
                        >
                          <TableCell>
                            <button className="rounded-input p-1 hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">{group.market || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-start gap-2">
                              <span className={cn("mt-1 h-2 w-2 rounded-pill", mediaAccentClassName(mediaType))} />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="line-clamp-1">
                                    {details.length > 0 ? details.join(' • ') : `Line item ${group.lineItemId || '—'}`}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{details.length > 0 ? details.join(' • ') : `Line item ${group.lineItemId || '—'}`}</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatDate(group.groupStartDate)} - {formatDate(group.groupEndDate)}
                          </TableCell>
                          <TableCell className="num">{group.totalDeliverables.toLocaleString()}</TableCell>
                          <TableCell className="num font-medium">{formatCurrency(group.totalMedia)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{group.bursts.length} {group.bursts.length === 1 ? 'burst' : 'bursts'}</Badge>
                          </TableCell>
                        </TableRow>
                        {isExpanded && group.bursts.map((burst, burstIndex) => {
                          // Normalised bursts store numeric values; guard to keep rendering resilient
                          const burstBudget = typeof burst.budget === 'number' ? burst.budget : 0
                          const burstDeliverablesAmount =
                            typeof burst.deliverablesAmount === 'number'
                              ? burst.deliverablesAmount
                              : burstBudget

                          return (
                            <TableRow
                              key={`${groupKey}-burst-${burstIndex}`}
                              className={cn(
                                "bg-surface-panel transition-all duration-200",
                                "animate-in fade-in-0"
                              )}
                            >
                              <TableCell></TableCell>
                              <TableCell className="pl-8 text-sm text-muted-foreground">
                                Burst {burstIndex + 1}
                              </TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-sm">
                                <div className="space-y-1">
                                  <span>{formatDate(burst.startDate)} - {formatDate(burst.endDate)}</span>
                                  <ProgressBar
                                    value={burstDeliverablesAmount || 0}
                                    max={Math.max(group.totalMedia || 1, 1)}
                                    size="sm"
                                    color="info"
                                    className="w-40"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="num text-sm">
                                {(burst.deliverables ?? 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="num text-sm font-medium">
                                {formatCurrency(burstDeliverablesAmount)}
                              </TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            ) : null}
          </div>
        )
      })}
    </div>
    </TooltipProvider>
  )
}
