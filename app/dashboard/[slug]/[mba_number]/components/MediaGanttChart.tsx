"use client"

import { useMemo } from 'react'
import { format, eachDayOfInterval, startOfWeek, endOfWeek, parseISO } from 'date-fns'

interface MediaGanttChartProps {
  lineItems: Record<string, any[]>
  startDate: string
  endDate: string
}

// Excel gantt chart color: #FFD02A60 (pink/magenta)
const GANTT_COLOR = '#D02A60'

interface Burst {
  startDate: string
  endDate: string
  deliverables?: number
  calculatedValue?: number
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
        deliverables: burst.deliverables || burst.calculatedValue || 0,
        calculatedValue: burst.calculatedValue || burst.deliverables || 0
      }))
    } else if (typeof parsed === 'object') {
      return [{
        startDate: parsed.startDate || parsed.start_date || '',
        endDate: parsed.endDate || parsed.end_date || '',
        deliverables: parsed.deliverables || parsed.calculatedValue || 0,
        calculatedValue: parsed.calculatedValue || parsed.deliverables || 0
      }]
    }
  } catch (error) {
    console.error('Error parsing bursts_json:', error)
  }
  
  return []
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

function groupLineItems(items: any[], mediaType: string): Array<{ key: string; item: any; bursts: Burst[] }> {
  if (!items || items.length === 0) return []
  
  const groupingKeys = GROUPING_KEYS[mediaType] || ['market']
  const grouped: Map<string, { key: string; item: any; bursts: Burst[] }> = new Map()
  
  items.forEach(item => {
    // Parse bursts
    const bursts = parseBurstsJson(item.bursts_json || item.bursts)
    
    // If no bursts, create one from item dates
    const itemBursts = bursts.length > 0 ? bursts : [{
      startDate: item.start_date || item.startDate || item.placement_date || '',
      endDate: item.end_date || item.endDate || item.placement_date || '',
      deliverables: item.deliverables || item.timps || item.tarps || item.spots || item.insertions || item.panels || item.screens || item.clicks || item.impressions || 0,
      calculatedValue: item.deliverables || item.timps || item.tarps || item.spots || item.insertions || item.panels || item.screens || item.clicks || item.impressions || 0
    }]
    
    // Create grouping key
    const key = groupingKeys.map(k => item[k] || '').join('|')
    
    if (!grouped.has(key)) {
      grouped.set(key, { key, item, bursts: [] })
    }
    
    const group = grouped.get(key)!
    group.bursts.push(...itemBursts)
  })
  
  return Array.from(grouped.values())
}

export default function MediaGanttChart({ lineItems, startDate, endDate }: MediaGanttChartProps) {
  const ganttData = useMemo(() => {
    if (!startDate || !endDate) return null

    const start = new Date(startDate)
    const end = new Date(endDate)
    
    // Calculate week boundaries (Sunday to Saturday) - matching Excel
    const weekStart = startOfWeek(start, { weekStartsOn: 0 })
    const weekEnd = endOfWeek(end, { weekStartsOn: 6 })
    
    // Generate all days in the range
    const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
    
    // Process line items - group them first
    const rows: Array<{
      label: string
      mediaType: string
      bars: Array<{
        start: Date
        end: Date
        startOffset: number
        width: number
        deliverables: number
      }>
    }> = []

    Object.entries(lineItems).forEach(([mediaType, items]) => {
      const grouped = groupLineItems(items, mediaType)
      
      grouped.forEach((group) => {
        // Create label from grouped item
        const labelParts = []
        if (group.item.market) labelParts.push(group.item.market)
        if (group.item.network || group.item.platform) labelParts.push(group.item.network || group.item.platform)
        if (group.item.station || group.item.site) labelParts.push(group.item.station || group.item.site)
        if (group.item.title) labelParts.push(group.item.title)
        const label = labelParts.length > 0 ? labelParts.join(' • ') : `${mediaType} Group`

        // Process each burst
        const bars: Array<{
          start: Date
          end: Date
          startOffset: number
          width: number
          deliverables: number
        }> = []

        // Sort bursts by start date
        const sortedBursts = [...group.bursts].sort((a, b) => {
          const aStart = a.startDate ? parseISO(a.startDate).getTime() : 0
          const bStart = b.startDate ? parseISO(b.startDate).getTime() : 0
          return aStart - bStart
        })

        sortedBursts.forEach(burst => {
          if (!burst.startDate) return

          const barStart = parseISO(burst.startDate)
          const barEnd = burst.endDate ? parseISO(burst.endDate) : barStart

          // Only include bars that overlap with the campaign period
          if (barEnd < start || barStart > end) return

          // Clamp dates to campaign period
          const clampedStart = barStart < start ? start : barStart
          const clampedEnd = barEnd > end ? end : barEnd

          const startOffset = Math.floor((clampedStart.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
          const width = Math.max(1, Math.floor((clampedEnd.getTime() - clampedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)

          const deliverables = burst.deliverables || burst.calculatedValue || 0

          bars.push({
            start: clampedStart,
            end: clampedEnd,
            startOffset,
            width,
            deliverables
          })
        })

        if (bars.length > 0) {
          rows.push({
            label,
            mediaType,
            bars
          })
        }
      })
    })

    return { rows, days: allDays, weekStart }
  }, [lineItems, startDate, endDate])

  if (!ganttData || ganttData.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No timeline data available
      </div>
    )
  }

  const { rows, days, weekStart } = ganttData

  // Group by weeks (Sunday to Saturday)
  const weeks: Date[][] = []
  let currentWeek: Date[] = []
  days.forEach((day, index) => {
    if (day.getDay() === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek)
      currentWeek = [day]
    } else {
      currentWeek.push(day)
    }
    if (index === days.length - 1 && currentWeek.length > 0) {
      weeks.push(currentWeek)
    }
  })

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        {/* Header with dates */}
        <div className="flex border-b">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex-1 border-r last:border-r-0">
              <div className="text-xs font-semibold text-center p-2 border-b bg-gray-50">
                {format(week[0], 'MMM d')} - {format(week[week.length - 1], 'MMM d, yyyy')}
              </div>
              <div className="flex">
                {week.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="flex-1 text-xs text-center p-1 border-r last:border-r-0 min-w-[40px]"
                  >
                    {format(day, 'd')}
                    <div className="text-[10px] text-muted-foreground">
                      {format(day, 'EEE')[0]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Gantt bars */}
        <div className="relative">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="border-b h-12 flex items-center relative">
              <div className="w-48 p-2 text-sm font-medium border-r bg-gray-50 shrink-0">
                <div className="truncate" title={row.label}>
                  {row.label}
                </div>
              </div>
              <div className="flex-1 relative h-full">
                {row.bars.map((bar, barIndex) => {
                  const dayWidth = 40 // Approximate width of each day
                  const left = bar.startOffset * dayWidth
                  const width = bar.width * dayWidth

                  return (
                    <div
                      key={barIndex}
                      className="absolute top-1/2 -translate-y-1/2 h-6 rounded flex items-center justify-center text-white text-xs font-medium border border-white/20"
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        backgroundColor: GANTT_COLOR,
                        minWidth: '20px'
                      }}
                      title={`${format(bar.start, 'dd/MM/yyyy')} - ${format(bar.end, 'dd/MM/yyyy')}\nDeliverables: ${bar.deliverables.toLocaleString()}`}
                    >
                      {width > 60 && (
                        <span className="truncate px-1">
                          {bar.deliverables > 0 ? bar.deliverables.toLocaleString() : format(bar.start, 'd/M')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
