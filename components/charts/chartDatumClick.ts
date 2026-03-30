export interface PieChartData {
  name: string
  value: number
  percentage: number
}

export type WaterfallDatum = {
  name: string
  value: number
  type: 'increase' | 'decrease' | 'total'
}

export type HorizontalBarDatum = { name: string; value: number }

/** Row shape aligned with `StackedColumnData` (month + series keys). */
export type ChartStackedColumnRow = { month: string } & Record<string, string | number>

/** Core fields for a clicked datum (before `id` is applied). Shared by pie and stacked column charts. */
export type ChartDatumClickCore =
  | {
      chart: 'pie'
      source: 'slice' | 'legend'
      name: string
      value: number
      percentage: number
      index: number
      datum: PieChartData
    }
  | {
      chart: 'stackedColumn'
      source: 'bar'
      name: string
      value: number
      category: string
      index: number
      datum: ChartStackedColumnRow
    }
  | {
      chart: 'stackedColumn'
      source: 'legend'
      name: string
      value: number
      category: string
      index: number
      datum: null
    }
  | {
      chart: 'treemap'
      source: 'cell'
      name: string
      value: number
      percentage: number
      index: number
      datum: PieChartData
    }
  | {
      chart: 'horizontalBar'
      source: 'bar'
      name: string
      value: number
      index: number
      datum: HorizontalBarDatum
    }
  | {
      chart: 'waterfall'
      source: 'segment'
      name: string
      value: number
      index: number
      datum: WaterfallDatum
    }

export type ChartDatumClickPayload = ChartDatumClickCore & { id: string }

export function defaultChartDatumId(core: ChartDatumClickCore): string {
  if (core.chart === 'pie') {
    return `pie:${core.source}:${core.index}:${core.name}`
  }
  if (core.chart === 'treemap') {
    return `treemap:cell:${core.index}:${core.name}`
  }
  if (core.chart === 'horizontalBar') {
    return `horizontalBar:bar:${core.index}:${core.name}`
  }
  if (core.chart === 'waterfall') {
    return `waterfall:segment:${core.index}:${core.name}`
  }
  if (core.source === 'legend') {
    return `stackedColumn:legend:${core.name}`
  }
  return `stackedColumn:bar:${core.category}:${core.name}`
}

export function finalizeChartDatumClickPayload(
  core: ChartDatumClickCore,
  getDatumId?: (payload: ChartDatumClickCore) => string,
): ChartDatumClickPayload {
  const id = getDatumId?.(core) ?? defaultChartDatumId(core)
  return { ...core, id }
}
