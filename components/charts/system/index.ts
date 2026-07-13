/**
 * AssembledView chart library — public surface.
 * import { LineChart, DonutChart, ... } from '@/components/charts';
 */

// Trends over time
export {
  LineChart, MultiLineChart, AreaChart, StackedAreaChart, StepChart, Sparkline,
  type LineProps, type AreaProps,
} from './line-charts';

// Comparison
export {
  BarChart, HorizontalBarChart, GroupedBarChart, StackedBarChart,
  PercentStackedBarChart, ComboChart, Histogram,
  type BarProps, type ComboProps, type ComboSeries, type ComboReferenceLine,
  type ChartReferenceLine, type SeriesClickPayload,
} from './bar-charts';

// Composition
export {
  DonutChart, GaugeChart, RadialBarsChart, TreemapChart, FunnelChart,
  type DonutProps, type TreemapProps,
} from './composition-charts';

// Distribution & relationship
export {
  ScatterChart, RadarChart, SlopeChart,
  type ScatterPoint, type ScatterQuadrantLabels, type RadarSeries,
} from './relation-charts';

// Flow & variance
export {
  WaterfallChart, BulletChart, SankeyChart,
  type BulletRow, type SankeyData,
} from './flow-charts';

// Custom SVG (no deps)
export {
  SunburstChart, MarimekkoChart, CalendarHeatmap,
  type SunburstNode, type MekkoColumn, type HeatCell,
} from './custom-charts';

// Domain / flighting (no deps)
export {
  MediaGanttChart, BurstGrid, MatrixHeatmap, PacingBandChart, BoxPlotChart,
  type GanttRow, type GanttBurst, type MediaGanttProps,
  type BurstRow, type BurstCell, type BoxStat,
  type PacingBandChartProps,
} from './domain-charts';

// Chart chrome — shell, toolbar, legend, export
export {
  BaseChartCard, ChartExportToolbar, ToggleableLegend, ChartFilterLegend, useLegendToggle,
  exportCsv, exportPng, captureNodePng,
  type BaseChartCardProps, type ChartExportToolbarProps, type LegendItem, type ToggleableLegendProps,
  type CapturedPng,
} from './chart-shell';

// Theme + helpers
export * from '@/lib/chart-theme';
