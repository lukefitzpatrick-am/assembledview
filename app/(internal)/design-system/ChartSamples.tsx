'use client';
/**
 * Live gallery — mirrors "Chart System.dc.html".
 * Gated by `app/(internal)/layout.tsx` (`notFound` in production).
 */
import {
  LineChart, MultiLineChart, AreaChart, StackedAreaChart, StepChart, Sparkline,
  BarChart, HorizontalBarChart, GroupedBarChart, StackedBarChart, PercentStackedBarChart, ComboChart, Histogram,
  DonutChart, GaugeChart, RadialBarsChart, TreemapChart, FunnelChart,
  ScatterChart, RadarChart, SlopeChart,
  WaterfallChart, BulletChart, SankeyChart,
  SunburstChart, MarimekkoChart, CalendarHeatmap,
  MediaGanttChart, BurstGrid, MatrixHeatmap, PacingBandChart, BoxPlotChart,
  BaseChartCard, ToggleableLegend, useLegendToggle,
} from '@/components/charts/system';
import * as React from 'react';
import { MediaChannelTag, mediaChannelTagRowClassName } from '@/components/dashboard/MediaChannelTag';
import { MEDIA_TYPE_REGISTRY } from '@/lib/charts/registry';
import * as D from './chart-samples';

const ALL_MEDIA_TYPE_PILL_LABELS = Object.values(MEDIA_TYPE_REGISTRY).map((row) => row.label);

function Card({ title, span = 1, children }: { title: string; span?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-card p-4" style={{ gridColumn: `span ${span}` }}>
      <div className="mb-3 text-sm font-bold tracking-tight text-foreground">{title}</div>
      <div className="rounded-input border border-border bg-muted p-3">{children}</div>
    </div>
  );
}

const channelSeries = [
  { key: 'budget', label: 'Budget' }, { key: 'actual', label: 'Actual' },
];

export function ChartSamples() {
  return (
    <div className="text-foreground">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4" style={{ alignItems: 'start' }}>
        <Card title="Line" span={2}><LineChart data={D.spendTrend} xKey="month" series={[{ key: 'spend', label: 'Spend' }]} valueFormat="dollars" /></Card>
        <Card title="Multi-line" span={2}><MultiLineChart data={D.spendTrend} xKey="month" series={[{ key: 'spend', label: 'Spend' }, { key: 'impressions', label: 'Impr.' }, { key: 'clicks', label: 'Clicks' }]} /></Card>
        <Card title="Area" span={2}><AreaChart data={D.spendTrend} xKey="month" series={[{ key: 'spend', label: 'Spend' }]} valueFormat="dollars" /></Card>
        <Card title="Stacked area" span={2}><StackedAreaChart data={D.spendTrend} xKey="month" series={[{ key: 'clicks', label: 'Clicks' }, { key: 'impressions', label: 'Impr.' }, { key: 'spend', label: 'Spend' }]} /></Card>
        <Card title="Step"><StepChart data={D.spendTrend.slice(0, 8)} xKey="month" series={[{ key: 'spend', label: 'Target' }]} valueFormat="dollars" /></Card>
        <Card title="Sparkline"><Sparkline data={D.spendTrend} dataKey="spend" /></Card>

        <Card title="Bar"><BarChart data={D.channelSpend} xKey="channel" series={[{ key: 'actual', label: 'Actual' }]} valueFormat="dollars" /></Card>
        <Card title="Horizontal bar"><HorizontalBarChart data={D.channelSpend} xKey="channel" series={[{ key: 'actual', label: 'Actual' }]} valueFormat="dollars" /></Card>
        <Card title="Grouped bar" span={2}><GroupedBarChart data={D.channelSpend} xKey="channel" series={channelSeries} valueFormat="dollars" /></Card>
        <Card title="Stacked bar"><StackedBarChart data={D.spendTrend.slice(0, 7)} xKey="month" series={[{ key: 'spend', label: 'Spend' }, { key: 'clicks', label: 'Clicks' }]} /></Card>
        <Card title="100% stacked"><PercentStackedBarChart data={D.spendTrend.slice(0, 7)} xKey="month" series={[{ key: 'spend', label: 'Spend' }, { key: 'clicks', label: 'Clicks' }]} /></Card>
        <Card title="Combo (bar + line)" span={2}><ComboChart data={D.spendTrend} xKey="month" bar={{ key: 'impressions', label: 'Impr.', format: 'compact' }} line={{ key: 'clicks', label: 'Clicks', format: 'compact' }} /></Card>
        <Card title="Histogram"><Histogram data={D.cpmDistribution} xKey="bin" xLabel="CPM ($)" /></Card>
        <Card title="Slope"><SlopeChart data={D.rankShift} leftLabel="2025" rightLabel="2026" /></Card>
        <Card title="Waterfall" span={2}><WaterfallChart steps={D.budgetWaterfall} /></Card>
        <Card title="Bullet" span={2}><BulletChart rows={D.pacingBullets} /></Card>

        <Card title="Donut"><DonutChart data={D.mediaMix} centerValue="$521k" /></Card>
        <Card title="Gauge"><GaugeChart value={73} /></Card>
        <Card title="Radial bars"><RadialBarsChart data={[{ label: 'TV', value: 86 }, { label: 'Social', value: 64 }, { label: 'Search', value: 42 }]} /></Card>
        <Card title="Treemap" span={2}><TreemapChart data={D.mediaMix} /></Card>
        <Card title="Sunburst"><SunburstChart data={D.spendHierarchy} /></Card>
        <Card title="Marimekko" span={2}><MarimekkoChart columns={D.mekkoMix} /></Card>

        <Card title="Scatter / bubble" span={2}><ScatterChart data={D.cpaVsRoas} xLabel="CPA" yLabel="ROAS" /></Card>
        <Card title="Radar"><RadarChart data={D.channelProfile} axisKey="metric" series={[{ key: 'linear', label: 'Linear' }, { key: 'digital', label: 'Digital' }]} /></Card>
        <Card title="Funnel"><FunnelChart data={D.conversionFunnel} /></Card>
        <Card title="Calendar heatmap" span={2}><CalendarHeatmap caption="Daily impressions — 12 weeks" /></Card>
        <Card title="Sankey" span={2}><SankeyChart data={D.budgetFlow} /></Card>

        <Card title="Media-type pills (MEDIA_TYPE_REGISTRY → MediaChannelTag)" span={4}>
          <div className={mediaChannelTagRowClassName}>
            {ALL_MEDIA_TYPE_PILL_LABELS.map((label) => (
              <MediaChannelTag key={label} label={label} />
            ))}
          </div>
        </Card>

        {/* ── Domain / flighting ── */}
        <div style={{ gridColumn: 'span 4', marginTop: 12, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--av-axis)' }}>
          06 · MEDIA FLIGHTING &amp; TIMELINES
        </div>
        <div style={{ gridColumn: 'span 2' }}><ShellExample /></div>
        <Card title="Boxplot" span={2}><BoxPlotChart data={D.cpmByChannel} /></Card>
        <Card title="Media flighting Gantt" span={4}><MediaGanttChart rows={D.flightPlan} todayWeek={11.4} /></Card>
        <Card title="Burst week-grid (expert editor)" span={2}><BurstGrid rows={D.burstRows} /></Card>
        <Card title="Matrix heatmap" span={2}><MatrixHeatmap rows={D.daypartMatrix.rows} cols={D.daypartMatrix.cols} values={D.daypartMatrix.values} /></Card>
        <Card title="Pacing vs target band" span={2}><PacingBandChart actual={D.pacingActual} weekLabels={D.pacingWeeks} /></Card>
      </div>
    </div>
  );
}

/** Shows the chart chrome wired up: shell + export toolbar + toggleable legend. */
function ShellExample() {
  const { hidden, toggle } = useLegendToggle(['clicks']);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const items = [
    { key: 'spend', label: 'Spend', color: 'var(--av-chart-1)' },
    { key: 'impressions', label: 'Impressions', color: 'var(--av-chart-2)' },
    { key: 'clicks', label: 'Clicks', color: 'var(--av-chart-3)' },
  ];
  const series = items.filter((i) => !hidden.has(i.key)).map((i) => ({ key: i.key, label: i.label }));
  return (
    <BaseChartCard
      title="Spend by channel"
      subtitle="Last 6 months · AUD"
      bodyRef={bodyRef}
      exportPage="gallery"
      exportSeries={{
        data: D.spendTrend,
        xKey: "month",
        seriesKeys: items.map((i) => i.key),
      }}
      legend={<ToggleableLegend items={items} hidden={hidden} onToggle={toggle} />}
    >
      <MultiLineChart data={D.spendTrend} xKey="month" series={series} valueFormat="compact" showLegend={false} />
    </BaseChartCard>
  );
}
