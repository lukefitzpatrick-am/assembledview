"use client"

import { useMemo, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface MediaTableProps {
  lineItems: Record<string, any[]>
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

interface Burst {
  startDate: string
  endDate: string
  budget?: string | number
  deliverablesAmount?: string | number
  deliverables?: number
  calculatedValue?: number
}

interface GroupedItem {
  key: string
  market?: string
  network?: string
  station?: string
  platform?: string
  site?: string
  title?: string
  placement?: string
  size?: string
  daypart?: string
  targeting?: string
  creative?: string
  bidStrategy?: string
  buyType?: string
  buyingDemo?: string
  totalMedia: number
  totalDeliverables: number
  groupStartDate: string
  groupEndDate: string
  bursts: Burst[]
}

// Grouping keys for different media types (similar to Excel)
const GROUPING_KEYS: Record<string, string[]> = {
  television: ['market', 'network', 'station', 'daypart', 'placement', 'size', 'buyingDemo', 'buyType'],
  radio: ['market', 'network', 'station', 'placement', 'size', 'radioDuration', 'buyingDemo', 'buyType'],
  newspaper: ['market', 'network', 'title', 'placement', 'size', 'buyingDemo', 'buyType'],
  magazines: ['market', 'network', 'title', 'placement', 'size', 'buyingDemo', 'buyType'],
  search: ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  socialMedia: ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  progDisplay: ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  progVideo: ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  progBvod: ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  progAudio: ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  progOoh: ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  ooh: ['market', 'network', 'oohFormat', 'oohType', 'placement', 'size', 'buyingDemo', 'buyType'],
  cinema: ['market', 'network', 'station', 'placement', 'size', 'buyingDemo', 'buyType'],
  bvod: ['market', 'platform', 'site', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  digitalDisplay: ['market', 'platform', 'site', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  digitalAudio: ['market', 'platform', 'site', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  digitalVideo: ['market', 'platform', 'site', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
  integration: ['market', 'network', 'placement', 'size', 'buyingDemo', 'buyType'],
  influencers: ['market', 'platform', 'targeting', 'creative', 'buyingDemo', 'buyType']
}

function parseBurstsJson(burstsJson: any): Burst[] {
  if (!burstsJson) return []
  
  try {
    let parsed: any = burstsJson
    if (typeof burstsJson === 'string') {
      const trimmed = burstsJson.trim()
      if (!trimmed) return []
      parsed = JSON.parse(trimmed)
    }
    
    if (Array.isArray(parsed)) {
      return parsed.map((burst: any) => ({
        startDate: burst.startDate || burst.start_date || '',
        endDate: burst.endDate || burst.end_date || '',
        budget: burst.budget || burst.deliverablesAmount || 0,
        deliverablesAmount: burst.deliverablesAmount || burst.budget || 0,
        deliverables: burst.deliverables || burst.calculatedValue || 0,
        calculatedValue: burst.calculatedValue || burst.deliverables || 0
      }))
    } else if (typeof parsed === 'object') {
      return [{
        startDate: parsed.startDate || parsed.start_date || '',
        endDate: parsed.endDate || parsed.end_date || '',
        budget: parsed.budget || parsed.deliverablesAmount || 0,
        deliverablesAmount: parsed.deliverablesAmount || parsed.budget || 0,
        deliverables: parsed.deliverables || parsed.calculatedValue || 0,
        calculatedValue: parsed.calculatedValue || parsed.deliverables || 0
      }]
    }
  } catch (error) {
    console.error('Error parsing bursts_json:', error)
  }
  
  return []
}

function groupLineItems(items: any[], mediaType: string): GroupedItem[] {
  if (!items || items.length === 0) return []
  
  const groupingKeys = GROUPING_KEYS[mediaType] || ['market']
  const grouped: Map<string, GroupedItem> = new Map()
  
  items.forEach(item => {
    // Parse bursts
    const bursts = parseBurstsJson(item.bursts_json || item.bursts)
    
    // If no bursts, create one from item dates
    const itemBursts = bursts.length > 0 ? bursts : [{
      startDate: item.start_date || item.startDate || item.placement_date || '',
      endDate: item.end_date || item.endDate || item.placement_date || '',
      budget: item.totalMedia || item.grossMedia || item.budget || item.spend || 0,
      deliverablesAmount: item.totalMedia || item.grossMedia || item.budget || item.spend || 0,
      deliverables: item.deliverables || item.timps || item.tarps || item.spots || item.insertions || item.panels || item.screens || item.clicks || item.impressions || 0
    }]
    
    // Create grouping key
    const key = groupingKeys.map(k => item[k] || '').join('|')
    
    if (!grouped.has(key)) {
      const firstBurst = itemBursts[0]
      grouped.set(key, {
        key,
        market: item.market,
        network: item.network,
        station: item.station,
        platform: item.platform,
        site: item.site,
        title: item.title,
        placement: item.placement,
        size: item.size,
        daypart: item.daypart,
        targeting: item.targeting || item.creativeTargeting,
        creative: item.creative,
        bidStrategy: item.bidStrategy || item.bid_strategy,
        buyType: item.buyType || item.buy_type,
        buyingDemo: item.buyingDemo || item.buying_demo,
        totalMedia: 0,
        totalDeliverables: 0,
        groupStartDate: firstBurst.startDate,
        groupEndDate: firstBurst.endDate,
        bursts: []
      })
    }
    
    const group = grouped.get(key)!
    
    // Add bursts to group
    itemBursts.forEach(burst => {
      group.bursts.push(burst)
      const budget = typeof burst.budget === 'string' 
        ? parseFloat(burst.budget.replace(/[^0-9.-]+/g, '')) || 0
        : (burst.budget || 0)
      const deliverablesAmount = typeof burst.deliverablesAmount === 'string'
        ? parseFloat(burst.deliverablesAmount.replace(/[^0-9.-]+/g, '')) || 0
        : (burst.deliverablesAmount || budget || 0)
      
      group.totalMedia += deliverablesAmount
      group.totalDeliverables += (burst.deliverables || burst.calculatedValue || 0)
      
      // Update group date range
      if (burst.startDate && (!group.groupStartDate || burst.startDate < group.groupStartDate)) {
        group.groupStartDate = burst.startDate
      }
      if (burst.endDate && (!group.groupEndDate || burst.endDate > group.groupEndDate)) {
        group.groupEndDate = burst.endDate
      }
    })
  })
  
  return Array.from(grouped.values())
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
      maximumFractionDigits: 2
    }).format(num || 0)
  }

  const groupedData = useMemo(() => {
    const result: Record<string, GroupedItem[]> = {}
    
    Object.entries(lineItems).forEach(([mediaType, items]) => {
      if (items && items.length > 0) {
        result[mediaType] = groupLineItems(items, mediaType)
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
                    const details = []
                    if (group.network) details.push(`Network: ${group.network}`)
                    if (group.station) details.push(`Station: ${group.station}`)
                    if (group.platform) details.push(`Platform: ${group.platform}`)
                    if (group.site) details.push(`Site: ${group.site}`)
                    if (group.title) details.push(`Title: ${group.title}`)
                    if (group.targeting) details.push(`Targeting: ${group.targeting}`)
                    if (group.creative) details.push(`Creative: ${group.creative}`)
                    if (group.daypart) details.push(`Daypart: ${group.daypart}`)
                    if (group.placement) details.push(`Placement: ${group.placement}`)
                    if (group.size) details.push(`Size: ${group.size}`)
                    if (group.bidStrategy) details.push(`Bid: ${group.bidStrategy}`)
                    if (group.buyType) details.push(`Buy: ${group.buyType}`)

                    const groupKey = `${mediaType}-${groupIndex}`
                    const isExpanded = expandedGroups.has(groupKey)

                    return (
                      <>
                        <TableRow key={groupIndex} className="cursor-pointer hover:bg-gray-50" onClick={() => toggleGroup(groupKey)}>
                          <TableCell>
                            <button className="p-1 hover:bg-gray-100 rounded">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">{group.market || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {details.length > 0 ? details.join(' • ') : '-'}
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
                          const burstBudget = typeof burst.budget === 'string'
                            ? parseFloat(burst.budget.replace(/[^0-9.-]+/g, '')) || 0
                            : (burst.budget || 0)
                          const burstDeliverablesAmount = typeof burst.deliverablesAmount === 'string'
                            ? parseFloat(burst.deliverablesAmount.replace(/[^0-9.-]+/g, '')) || 0
                            : (burst.deliverablesAmount || burstBudget || 0)

                          return (
                            <TableRow key={`${groupIndex}-${burstIndex}`} className="bg-gray-50">
                              <TableCell></TableCell>
                              <TableCell className="text-sm text-muted-foreground pl-8">
                                Burst {burstIndex + 1}
                              </TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-sm">
                                {formatDate(burst.startDate)} - {formatDate(burst.endDate)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {(burst.deliverables || burst.calculatedValue || 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {formatCurrency(burstDeliverablesAmount)}
                              </TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          )
                        })}
                      </>
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
