"use client"

import { useMemo, useState, Fragment } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { NormalisedLineItem, groupByLineItemId } from '@/lib/mediaplan/normalizeLineItem'

interface MediaTableProps {
  lineItems: Record<string, NormalisedLineItem[]>
}

const MEDIA_TYPE_DISPLAY_NAMES: Record<string, string> = {
  television: 'Television',
  radio: 'Radio',
  newspaper: 'Newspaper',
  magazines: 'Magazines',
  ooh: 'OOH',
  cinema: 'Cinema',
  digitalDisplay: 'Digital Display',
  digitalAudio: 'Digital Audio',
  digitalVideo: 'Digital Video',
  bvod: 'BVOD',
  integration: 'Integration',
  search: 'Search',
  socialMedia: 'Social Media',
  progDisplay: 'Programmatic Display',
  progVideo: 'Programmatic Video',
  progBvod: 'Programmatic BVOD',
  progAudio: 'Programmatic Audio',
  progOoh: 'Programmatic OOH',
  influencers: 'Influencers'
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

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedGroups(newExpanded)
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
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(num || 0)
  }

  const groupedData = useMemo(() => {
    const result: Record<string, GroupedItem[]> = {}

    Object.entries(lineItems || {}).forEach(([mediaType, items]) => {
      if (Array.isArray(items) && items.length > 0) {
        const groupedItems = groupByLineItemId(items, mediaType)
        result[mediaType] = groupLineItems(groupedItems)
      }
    })

    return result
  }, [lineItems])

  const hasLineItems = Object.values(lineItems).some(items => items && items.length > 0)

  if (!hasLineItems) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No media line items available
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedData).map(([mediaType, groups]) => {
        if (!groups || groups.length === 0) return null

        const displayName = MEDIA_TYPE_DISPLAY_NAMES[mediaType] || mediaType
        const totalSpend = groups.reduce((sum, group) => sum + group.totalMedia, 0)
        const totalItems = groups.reduce((sum, group) => sum + group.bursts.length, 0)

        return (
          <div key={mediaType} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{displayName}</h3>
              <Badge variant="outline">
                {groups.length} {groups.length === 1 ? 'group' : 'groups'} • {totalItems} {totalItems === 1 ? 'burst' : 'bursts'} • Total: {formatCurrency(totalSpend)}
              </Badge>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Market</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Deliverables</TableHead>
                    <TableHead>Gross Media</TableHead>
                    <TableHead>Bursts</TableHead>
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
                        <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => toggleGroup(groupKey)}>
                          <TableCell>
                            <button className="p-1 hover:bg-gray-100 rounded">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">{group.market || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {details.length > 0 ? details.join(' • ') : `Line item ${group.lineItemId || '—'}`}
                          </TableCell>
                          <TableCell>
                            {formatDate(group.groupStartDate)} - {formatDate(group.groupEndDate)}
                          </TableCell>
                          <TableCell>{group.totalDeliverables.toLocaleString()}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(group.totalMedia)}</TableCell>
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
                            <TableRow key={`${groupKey}-burst-${burstIndex}`} className="bg-gray-50">
                              <TableCell></TableCell>
                              <TableCell className="text-sm text-muted-foreground pl-8">
                                Burst {burstIndex + 1}
                              </TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-sm">
                                {formatDate(burst.startDate)} - {formatDate(burst.endDate)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {(burst.deliverables ?? 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
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
          </div>
        )
      })}
    </div>
  )
}
