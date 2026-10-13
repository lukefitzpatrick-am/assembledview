'use client';
/**
 * AssembledView charts — DOMAIN / FLIGHTING (zero extra dependencies)
 * MediaGanttChart · BurstGrid · MatrixHeatmap · PacingBandChart · BoxPlotChart
 *
 * These are AssembledView-specific visualisations the generic 27-chart core
 * doesn't cover. All pure SVG on the shared tokens — no Recharts, no ECharts.
 *
 * MediaGanttChart is the important one: ONE flexible flight/Gantt component
 * intended to back all three in-app usages — the burst editor, the
 * MediaContainerTimeline, and the campaign calendar. Feed it rows of bursts.
 */
import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { round } from '@/lib/chart-utils';
import { BRAND } from '@/lib/brand';
import { CHART_PALETTE, CHANNEL_COLORS, SEQUENTIAL, NEUTRAL, STATUS, fmt } from '@/lib/chart-theme';
import { cn } from '@/lib/utils';

const INK = NEUTRAL.ink, MUTED = NEUTRAL.axis, MID = NEUTRAL.label, GRID = NEUTRAL.grid;
const TAB: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

/** 0.6em advance. Used to drop a bar label that would run past the bar. */
export function ganttLabelWidthPx(text: string, fontSize = 11): number {
  return text.length * fontSize * 0.6;
}

/** True when `label` fits inside the bar after `padding` px (default 12). */
export function ganttLabelFits(label: string, barWidthPx: number, padding = 12): boolean {
  return ganttLabelWidthPx(label) <= barWidthPx - padding;
}

/** One line, ellipsis, so a gutter label cannot spill into the plot. */
export function ellipsizeToWidth(text: string, maxPx: number, fontSize: number): string {
  if (maxPx <= 0) return '';
  if (ganttLabelWidthPx(text, fontSize) <= maxPx) return text;
  const mark = '…';
  let cut = text;
  while (cut.length > 0 && ganttLabelWidthPx(`${cut}${mark}`, fontSize) > maxPx) {
    cut = cut.slice(0, -1);
  }
  return cut.length > 0 ? `${cut}${mark}` : mark;
}

/** Day numbers. A column under 28px wide keeps every second label. */
export function thinnedWeekLabels(labels: readonly string[], columnWidthPx: number): Array<string | null> {
  const step = columnWidthPx < 28 ? 2 : 1;
  return labels.map((label, index) => (index % step === 0 ? label : null));
}

/** Left edge of `dayIndex` across the plot. `totalDays` is the campaign span. */
export function burstDayX(dayIndex: number, totalDays: number, gutter: number, plotWidth: number): number {
  if (totalDays <= 0) return gutter;
  return gutter + (dayIndex / totalDays) * plotWidth;
}

/** Week column whose Monday boundary contains `day`. */
export function weekColumnContainingDay(day: number, weekDayIndexes: readonly number[], totalDays: number): number {
  let found = 0;
  for (let index = 0; index < weekDayIndexes.length; index++) {
    const start = weekDayIndexes[index] ?? 0;
    const end = index + 1 < weekDayIndexes.length ? (weekDayIndexes[index + 1] ?? totalDays) : totalDays;
    if (day >= start && day < end) found = index;
  }
  return found;
}

// ── Media flighting Gantt ───────────────────────────────────
export interface GanttBurst {
  startWeek: number;        // 0-indexed week the burst starts
  endWeek: number;          // exclusive end week
  /** Inclusive day index from the campaign start. Bars use this, not the week column. */
  startDay?: number;
  /** Inclusive day index from the campaign start. */
  endDay?: number;
  label?: string;           // e.g. "$46k" / "320 TARP" / "400 / 1,000"
  intensity?: number;       // 0..1 — weight/share, drives fill opacity
  /** Delivered ÷ planned. Visual width is capped at 1; omit for planned-only bars. */
  fillRatio?: number;
  /** Flighting palette. Active is forest; past or future is context. */
  tone?: "active" | "context";
  /** Burst dates, planned deliverables, and the line delivery note when this bar carries it. */
  tooltip?: string;
}
export interface GanttRow {
  label: string;            // line item (publisher / placement)
  sub?: string;             // channel label
  /** Media-type key used to group lines before the reshape. */
  channelKey?: string;
  /** In-window burst budgets, dollars. Omitted when none parse. */
  plannedMedia?: number;
  color?: string;           // defaults to a CHANNEL_COLORS hue or palette
  bursts: GanttBurst[];
  /** Channel summary. The label cell toggles the lines under it. */
  summary?: boolean;
  /** Open state for a summary row. */
  expanded?: boolean;
  /** Line drawn under an open channel summary. */
  indent?: boolean;
}
export interface GanttMonthBand {
  label: string;
  startWeek: number;
  weeks: number;
}

export interface MediaGanttProps {
  rows: GanttRow[];
  weeks?: number;           // total weeks on the timeline (default 24)
  months?: string[];        // month header labels (legacy equal-width)
  weeksPerMonth?: number;   // default 4 — used when monthBands omitted
  /** Calendar-aligned month spans; when set, overrides equal weeksPerMonth bands. */
  monthBands?: GanttMonthBand[];
  /** Monday week-start day numbers, one per column. Weekly view only. */
  weekLabels?: string[];
  todayWeek?: number | null;
  /** Campaign length in days. With `startDay` on each burst, 1 SVG unit is a day fraction of the plot. */
  totalDays?: number;
  /** Melbourne today as a day index into `totalDays`. Null when today is outside the campaign. */
  todayDay?: number | null;
  /** Day index of each Monday week boundary, weekly view. */
  weekDayIndexes?: number[];
  rowHeight?: number;
  className?: string;
  /** Summary-row label cell. Index is the row in `rows`. */
  onToggleSummary?: (rowIndex: number) => void;
}

const GANTT_MIN_W = 960;
const GANTT_GUTTER = 300;
const GANTT_GROUP_H = 36;
const GANTT_LINE_H = 40;
const GANTT_BAR_H = 20;
const GANTT_BAR_RX = 4;

export function MediaGanttChart({
  rows, weeks = 24, months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  weeksPerMonth = 4, monthBands, weekLabels, todayWeek = null, todayDay = null, totalDays, weekDayIndexes, className,
  onToggleSummary,
}: MediaGanttProps) {
  const [tip, setTip] = React.useState<{ x: number; y: number; label: string; sub?: string } | null>(null);
  const [measured, setMeasured] = React.useState(GANTT_MIN_W);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const headScrollRef = React.useRef<HTMLDivElement>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const gutterClipId = `gantt-gutter-clip-${React.useId().replace(/:/g, "")}`;
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const apply = (width: number) => {
      if (width > 0) setMeasured(Math.round(width));
    };
    apply(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      apply(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const weekly = weekLabels != null && weekLabels.length > 0;
  const dayPlot = typeof totalDays === "number" && totalDays > 0;
  const W = Math.max(GANTT_MIN_W, measured);
  const headH = weekly ? 48 : 44;
  const plotW = W - GANTT_GUTTER - 16;
  const weekW = weeks > 0 ? plotW / weeks : plotW;
  const wx = (w: number) => GANTT_GUTTER + weekW * w;
  const xForDay = (day: number) => burstDayX(day, totalDays ?? 1, GANTT_GUTTER, plotW);
  const rowHeights = rows.map((row) => (row.summary ? GANTT_GROUP_H : GANTT_LINE_H));
  const rowTops: number[] = [];
  let rowCursor = 0;
  for (const height of rowHeights) {
    rowTops.push(rowCursor);
    rowCursor += height;
  }
  const bodyH = rowCursor + 8;
  const bodyEls: React.ReactNode[] = [];
  const headerEls: React.ReactNode[] = [];
  const labelEls: React.ReactNode[] = [];
  const hitEls: React.ReactNode[] = [];
  const summaryButtons: React.ReactNode[] = [];
  const headerBands: GanttMonthBand[] =
    monthBands && monthBands.length > 0
      ? monthBands
      : months.map((m, i) => ({ label: m, startWeek: i * weeksPerMonth, weeks: weeksPerMonth }));
  const columnCount = weekly && weekLabels ? weekLabels.length : Math.max(1, weeks);
  const columnW = plotW / columnCount;
  const bandSpan = (band: GanttMonthBand): [number, number] => {
    if (weekly && dayPlot && weekDayIndexes && weekDayIndexes.length > 0) {
      const start = weekDayIndexes[band.startWeek] ?? 0;
      const end = weekDayIndexes[band.startWeek + band.weeks] ?? (totalDays as number);
      return [xForDay(start), xForDay(end)];
    }
    return [wx(band.startWeek), wx(band.startWeek + band.weeks)];
  };

  if (weekly && weekLabels) {
    headerBands.forEach((band, i) => {
      const [x0, x1] = bandSpan(band);
      headerEls.push(
        <text key={`mt${i}`} data-gantt-month="" x={round((x0 + x1) / 2)} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill={MID} letterSpacing=".06em">{band.label.toUpperCase()}</text>,
      );
    });
    const hiddenToday = todayDay != null && weekDayIndexes && weekDayIndexes.length > 0 && dayPlot
      ? weekColumnContainingDay(todayDay, weekDayIndexes, totalDays as number)
      : todayWeek != null
        ? Math.min(weekLabels.length - 1, Math.max(0, Math.floor(todayWeek)))
        : null;
    thinnedWeekLabels(weekLabels, columnW).forEach((label, w) => {
      if (label == null || w === hiddenToday) return;
      const x = weekDayIndexes && dayPlot
        ? (xForDay(weekDayIndexes[w] ?? 0) + xForDay(weekDayIndexes[w + 1] ?? (totalDays as number))) / 2
        : wx(w) + weekW / 2;
      headerEls.push(
        <text key={`wd${w}`} data-gantt-week="" x={round(x)} y={36} textAnchor="middle" fontSize={10} fontWeight={500} fill={MUTED} style={TAB}>{label}</text>,
      );
    });
  } else {
    headerBands.forEach((band, i) => {
      const [x0, x1] = bandSpan(band);
      const bandW = Math.max(1, x1 - x0 - 3);
      headerEls.push(<rect key={`mb${i}`} x={round(x0)} y={8} width={round(bandW)} height={20} rx={5} fill={i % 2 ? 'var(--av-grid)' : 'var(--av-subsurface)'} />);
      headerEls.push(<text key={`mt${i}`} data-gantt-month="" x={round(x0 + bandW / 2)} y={22} textAnchor="middle" fontSize={11} fontWeight={700} fill={MID} letterSpacing=".06em">{band.label.toUpperCase()}</text>);
    });
  }
  rows.forEach((row, ri) => {
    const y = rowTops[ri] ?? 0;
    const rowH = rowHeights[ri] ?? GANTT_LINE_H;
    bodyEls.push(<rect key={`rb${ri}`} x={0} y={round(y)} width={W} height={rowH} fill={row.summary ? "var(--av-subsurface)" : "var(--av-surface)"} />);
  });
  if (weekly && dayPlot && weekDayIndexes && weekDayIndexes.length > 0) {
    [...weekDayIndexes, totalDays as number].forEach((day, index) => {
      const x = xForDay(day);
      bodyEls.push(<line key={`wk${index}`} x1={round(x)} x2={round(x)} y1={0} y2={bodyH - 6} stroke="var(--av-grid)" strokeWidth={1} />);
    });
  } else {
    for (let w = 0; w <= weeks; w++) {
      bodyEls.push(<line key={`wk${w}`} x1={round(wx(w))} x2={round(wx(w))} y1={0} y2={bodyH - 6} stroke="var(--av-grid)" strokeWidth={1} />);
    }
  }
  rows.forEach((row, ri) => {
    const y = rowTops[ri] ?? 0;
    const rowH = rowHeights[ri] ?? GANTT_LINE_H;
    const color = row.color ?? CHANNEL_COLORS[(row.sub ?? '').toLowerCase()] ?? CHART_PALETTE[ri % CHART_PALETTE.length];
    const tickX = row.summary ? 28 : 40;
    const textX = row.summary ? 40 : 52;
    const labelSize = 13;
    const subSize = 11;
    const maxLabel = GANTT_GUTTER - textX - 8;
    const name = ellipsizeToWidth(row.label, maxLabel, labelSize);
    const subText = row.sub ? ellipsizeToWidth(row.sub, maxLabel, subSize) : undefined;
    labelEls.push(<rect key={`sw${ri}`} x={tickX} y={round(y + rowH / 2 - 7)} width={4} height={14} rx={2} fill={color} />);
    const nameY = subText ? y + (row.summary ? 15 : 16) : y + rowH / 2 + 4;
    labelEls.push(
      <text
        key={`rl${ri}`}
        data-gantt-group-label={row.summary ? "" : undefined}
        data-gantt-line-label={row.summary ? undefined : ""}
        x={textX}
        y={round(nameY)}
        fontSize={labelSize}
        fontWeight={row.summary ? 600 : 500}
        fill={INK}
      >
        {name}
        <title>{row.label}</title>
      </text>,
    );
    if (subText && row.sub) {
      labelEls.push(
        <text key={`rs${ri}`} x={textX} y={round(row.summary ? y + 29 : y + 32)} fontSize={subSize} fill={MUTED}>
          {subText}
          <title>{row.sub}</title>
        </text>,
      );
    }
    const burstBox = (burst: GanttBurst) => {
      if (dayPlot && typeof burst.startDay === "number" && typeof burst.endDay === "number") {
        const bx = xForDay(burst.startDay);
        const endX = xForDay(Math.min(totalDays as number, burst.endDay + 1));
        const span = endX - bx;
        return { bx, bw: span > 2 ? span - 2 : Math.max(1, span) };
      }
      const bx = wx(burst.startWeek);
      const span = weekW * (burst.endWeek - burst.startWeek);
      return { bx, bw: span > 2 ? span - 2 : Math.max(1, span) };
    };
    row.bursts.forEach((b, bi) => {
      const { bx, bw } = burstBox(b);
      const showBurstTip = (event: React.MouseEvent) => {
        if (!b.tooltip) return;
        const host = hostRef.current?.getBoundingClientRect();
        if (!host) return;
        const [head, ...rest] = b.tooltip.split("\n");
        setTip({ x: event.clientX - host.left, y: event.clientY - host.top, label: head ?? b.tooltip, sub: rest.join("\n") });
      };
      if (row.summary) {
        const bh = 6;
        const by = y + rowH / 2 - bh / 2;
        bodyEls.push(
          <rect key={`bf${ri}-${bi}`} data-gantt-summary-bar="" x={round(bx)} y={round(by)} width={round(bw)} height={bh} rx={2} fill={color} fillOpacity={0.6} />,
        );
        return;
      }
      const by = y + rowH / 2 - GANTT_BAR_H / 2;
      const visibleLabel = b.label && ganttLabelFits(b.label, bw) ? b.label : undefined;
      const labelY = by + 14;
      if (b.tone === "active" || b.tone === "context") {
        const fill = b.tone === "active" ? BRAND.colour.forest : BRAND.colour.context;
        const fillRatio = b.fillRatio;
        const hasDeliveryFill = typeof fillRatio === "number" && Number.isFinite(fillRatio);
        const labelFill = b.tone === "active" && (!hasDeliveryFill || fillRatio >= 1) ? BRAND.colour.white : BRAND.colour.ink;
        bodyEls.push(
          <rect key={`bf${ri}-${bi}`} data-gantt-burst="" x={round(bx)} y={round(by)} width={round(bw)} height={GANTT_BAR_H} rx={GANTT_BAR_RX} fill={fill} fillOpacity={hasDeliveryFill ? 0.22 : 1} onMouseMove={showBurstTip} onMouseLeave={() => setTip(null)}>
            {b.tooltip ? <title>{b.tooltip}</title> : null}
          </rect>,
        );
        if (hasDeliveryFill) {
          const fillW = round(bw * Math.min(1, Math.max(0, fillRatio)));
          if (fillW > 0) bodyEls.push(<rect key={`bp${ri}-${bi}`} x={round(bx)} y={round(by)} width={fillW} height={GANTT_BAR_H} rx={GANTT_BAR_RX} fill={fill} />);
        }
        if (visibleLabel) bodyEls.push(<text key={`bl${ri}-${bi}`} x={round(bx + 6)} y={round(labelY)} fontSize={11} fontWeight={600} fill={labelFill} style={TAB}>{visibleLabel}</text>);
        return;
      }
      const fillRatio = b.fillRatio;
      const hasDeliveryFill = typeof fillRatio === "number" && Number.isFinite(fillRatio);
      const fillW = hasDeliveryFill ? round(bw * Math.min(1, Math.max(0, fillRatio))) : round(bw);
      bodyEls.push(<rect key={`bg${ri}-${bi}`} data-gantt-burst="" x={round(bx)} y={round(by)} width={round(bw)} height={GANTT_BAR_H} rx={GANTT_BAR_RX} fill={color} fillOpacity={0.16} onMouseMove={showBurstTip} onMouseLeave={() => setTip(null)}>{b.tooltip ? <title>{b.tooltip}</title> : null}</rect>);
      if (fillW > 0) {
        bodyEls.push(<rect key={`bf${ri}-${bi}`} x={round(bx)} y={round(by)} width={fillW} height={GANTT_BAR_H} rx={GANTT_BAR_RX} fill={color} fillOpacity={(b.intensity ?? 0.85) * 0.92} />);
      }
      if (visibleLabel) bodyEls.push(<text key={`bl${ri}-${bi}`} x={round(bx + 6)} y={round(labelY)} fontSize={11} fontWeight={600} fill={BRAND.colour.white} style={TAB}>{visibleLabel}</text>);
    });
    if (row.summary) {
      const toggle = () => onToggleSummary?.(ri);
      const accessible = row.sub ? `${row.label}, ${row.sub}` : row.label;
      summaryButtons.push(
        <button
          key={`sum${ri}`}
          type="button"
          aria-expanded={row.expanded === true}
          aria-label={accessible}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggle();
          }}
          className="absolute z-10 flex cursor-pointer items-center overflow-hidden bg-transparent text-left hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: 0, width: GANTT_GUTTER, top: y, height: rowH, paddingLeft: 12 }}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", row.expanded ? "rotate-90" : undefined)}
            aria-hidden
          />
        </button>,
      );
      return;
    }
    hitEls.push(
      <rect
        key={`hit${ri}`}
        x={0}
        y={y}
        width={GANTT_GUTTER}
        height={rowH}
        fill="transparent"
        style={{ cursor: 'default' }}
        onMouseMove={(e) => {
          const host = hostRef.current?.getBoundingClientRect();
          if (!host) return;
          setTip({ x: e.clientX - host.left, y: e.clientY - host.top, label: row.label, sub: row.sub });
        }}
        onMouseLeave={() => setTip(null)}
      >
        <title>{row.label}</title>
      </rect>,
    );
  });
  const todayX = todayDay != null && dayPlot
    ? xForDay(todayDay)
    : todayWeek != null
      ? wx(todayWeek)
      : null;
  if (todayX != null) {
    if (weekly) {
      headerEls.push(<rect key="tb" data-gantt-today="" x={round(todayX - 21)} y={24} width={42} height={14} rx={7} fill={INK} />);
      headerEls.push(<text key="tt" x={round(todayX)} y={34} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--av-surface)">TODAY</text>);
    }
    bodyEls.push(<line key="tl" x1={round(todayX)} x2={round(todayX)} y1={0} y2={bodyH - 6} stroke={INK} strokeWidth={1.5} strokeDasharray="3 3" />);
  }
  return (
    <div className={className}>
      <div
        data-gantt-axis=""
        className="sticky top-0 z-20 border-b border-border bg-background"
      >
        <div ref={headScrollRef} className="overflow-x-hidden">
          <svg viewBox={`0 0 ${W} ${headH}`} width={W} height={headH} style={{ display: 'block' }}>
            {headerEls}
          </svg>
        </div>
      </div>
      <div
        ref={scrollRef}
        data-gantt-scroll=""
        className="overflow-x-auto"
        onScroll={(event) => {
          if (headScrollRef.current) headScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
      >
        <div ref={hostRef} className="relative" style={{ width: W, minWidth: GANTT_MIN_W }}>
          <svg viewBox={`0 0 ${W} ${bodyH}`} width={W} height={bodyH} style={{ display: 'block' }}>
            <defs>
              <clipPath id={gutterClipId}>
                <rect x={0} y={0} width={GANTT_GUTTER - 8} height={bodyH} />
              </clipPath>
            </defs>
            {bodyEls}
            <g clipPath={`url(#${gutterClipId})`}>{labelEls}</g>
            {hitEls}
          </svg>
          {summaryButtons}
          {/* Class string mirrors CHART_TOOLTIP_CONTENT_CLASS in components/ui/chart.tsx — sync manually if that changes. */}
          {tip && (
            <div
              className="pointer-events-none absolute z-50 grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-tooltip"
              style={{ left: tip.x + 12, top: tip.y + 12 }}
            >
              <div className="font-medium">{tip.label}</div>
              {tip.sub ? <span className="whitespace-pre-line text-muted-foreground">{tip.sub}</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Burst week-grid (expert editor) ─────────────────────────
export interface BurstCell { startWeek: number; endWeek: number; label: string; color?: string }
export interface BurstRow { label: string; cells: BurstCell[] }

export function BurstGrid({ rows, weeks = 12, className }: { rows: BurstRow[]; weeks?: number; className?: string }) {
  const W = 560, padL = 84, x1 = W - 8, headH = 22, rowH = 30;
  const H = headH + rows.length * rowH + 4, cw = (x1 - padL) / weeks;
  const els: React.ReactNode[] = [];
  for (let w = 0; w < weeks; w++) els.push(<text key={`wn${w}`} x={round(padL + cw * w + cw / 2)} y={14} textAnchor="middle" fontSize={8.5} fill={MUTED} fontWeight={600} style={TAB}>{`W${w + 1}`}</text>);
  rows.forEach((row, ri) => {
    const y = headH + ri * rowH;
    els.push(<text key={`gl${ri}`} x={padL - 8} y={round(y + rowH / 2 + 3)} textAnchor="end" fontSize={10} fontWeight={700} fill={INK}>{row.label}</text>);
    for (let w = 0; w < weeks; w++) els.push(<rect key={`gc${ri}-${w}`} x={round(padL + cw * w) + 0.5} y={round(y) + 0.5} width={round(cw) - 1} height={rowH - 1} fill="var(--av-surface)" stroke="var(--av-grid)" strokeWidth={1} />);
  });
  rows.forEach((row, ri) => {
    const y = headH + ri * rowH;
    row.cells.forEach((c, ci) => {
      const bx = padL + cw * c.startWeek, bw = cw * (c.endWeek - c.startWeek + 1);
      els.push(<rect key={`mc${ri}-${ci}`} x={round(bx) + 2} y={round(y) + 3} width={round(bw) - 4} height={rowH - 6} rx={4} fill={c.color ?? CHART_PALETTE[ri % CHART_PALETTE.length]} />);
      els.push(<text key={`mt${ri}-${ci}`} x={round(bx + bw / 2)} y={round(y + rowH / 2 + 3.5)} textAnchor="middle" fontSize={9} fontWeight={700} fill={BRAND.colour.white}>{c.label}</text>);
    });
  });
  return <div className={className}><svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}

// ── Matrix heatmap (2-D, e.g. daypart × day) ────────────────
export function MatrixHeatmap({
  rows, cols, values, showValues = true, className,
}: { rows: string[]; cols: string[]; values: number[][]; showValues?: boolean; className?: string }) {
  const W = 560, padL = 78, padT = 20, x1 = W - 10, gap = 3;
  const cw = (x1 - padL) / cols.length, ch = 26, H = padT + rows.length * ch + 22;
  const seq = (v: number) => SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor(v * SEQUENTIAL.length))];
  const els: React.ReactNode[] = [];
  cols.forEach((c, i) => els.push(<text key={`dh${i}`} x={round(padL + cw * i + cw / 2)} y={14} textAnchor="middle" fontSize={9} fill={MUTED} fontWeight={600}>{c}</text>));
  rows.forEach((p, ri) => {
    els.push(<text key={`ph${ri}`} x={padL - 8} y={round(padT + ch * ri + ch / 2 + 3)} textAnchor="end" fontSize={9.5} fill={MID} fontWeight={600}>{p}</text>);
    cols.forEach((_, ci) => {
      const v = values[ri][ci];
      els.push(<rect key={`mh${ri}-${ci}`} x={round(padL + cw * ci) + gap / 2} y={round(padT + ch * ri) + gap / 2} width={round(cw) - gap} height={ch - gap} rx={3} fill={seq(v)} />);
      if (showValues) els.push(<text key={`mv${ri}-${ci}`} x={round(padL + cw * ci + cw / 2)} y={round(padT + ch * ri + ch / 2 + 3)} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={v > 0.6 ? BRAND.colour.white : MID} style={TAB}>{Math.round(v * 100)}</text>);
    });
  });
  els.push(<text key="lgl" x={padL} y={H - 3} fontSize={8.5} fill={MUTED}>Low</text>);
  SEQUENTIAL.forEach((c, i) => els.push(<rect key={`lr${i}`} x={padL + 22 + i * 12} y={H - 11} width={11} height={8} rx={1} fill={c} />));
  els.push(<text key="lgh" x={padL + 22 + SEQUENTIAL.length * 12 + 5} y={H - 3} fontSize={8.5} fill={MUTED}>High</text>);
  return <div className={className}><svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}

// ── Pacing vs target band ───────────────────────────────────
const smooth = (p: [number, number][]) => {
  if (p.length < 3) return p.map((q, i) => (i ? 'L' : 'M') + round(q[0]) + ' ' + round(q[1])).join(' ');
  let d = 'M' + round(p[0][0]) + ' ' + round(p[0][1]);
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ' C' + round(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + round(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + round(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + round(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + round(p2[0]) + ' ' + round(p2[1]);
  }
  return d;
};
const poly = (p: [number, number][]) => p.map((q, i) => (i ? 'L' : 'M') + round(q[0]) + ' ' + round(q[1])).join(' ');

export interface PacingBandChartProps {
  actual: number[];
  target?: number[];
  /** Symmetric band width when `bandLow` / `bandHigh` are omitted. */
  tolerance?: number;
  /** Explicit envelope — overrides tolerance-derived band. */
  bandLow?: number[];
  bandHigh?: number[];
  weekLabels?: string[];
  /** 0-based index for a vertical "today" marker. */
  todayIndex?: number;
  ymax?: number;
  targetColor?: string;
  actualColor?: string;
  actualLabel?: string;
  className?: string;
}

export function PacingBandChart({
  actual,
  target,
  tolerance = 8,
  bandLow,
  bandHigh,
  weekLabels,
  todayIndex,
  ymax: ymaxProp,
  targetColor = STATUS.ahead,
  actualColor = NEUTRAL.ink,
  actualLabel = 'Actual delivery',
  className,
}: PacingBandChartProps) {
  const w = 600, hh = 200, x0 = 34, x1 = w - 12, y0 = 14, y1 = hh - 22, n = actual.length;
  if (n < 2) return null;

  const mid = target ?? Array.from({ length: n }, (_, i) => (i / (n - 1)) * 100);
  const up = bandHigh ?? mid.map((v) => Math.min(100, v + tolerance));
  const lo = bandLow ?? mid.map((v) => Math.max(0, v - tolerance));
  const ymax = ymaxProp ?? Math.max(100, ...up, ...actual, ...mid);

  const sx = (i: number) => x0 + (x1 - x0) * i / (n - 1);
  const sy = (v: number) => y1 + (y0 - y1) * v / ymax;
  const yTick = (v: number) => (ymax <= 100 ? `${Math.round(v)}%` : fmt.compact(v));

  const els: React.ReactNode[] = [];
  for (let k = 0; k <= 4; k++) {
    const v = ymax * k / 4;
    const yy = sy(v);
    els.push(<line key={`g${k}`} x1={x0} x2={x1} y1={round(yy)} y2={round(yy)} stroke={GRID} strokeWidth={1} />);
    els.push(<text key={`gl${k}`} x={x0 - 6} y={round(yy) + 3} textAnchor="end" fontSize={9} fill={MUTED} style={TAB}>{yTick(v)}</text>);
  }

  const upPts = up.map((v, i) => [sx(i), sy(v)] as [number, number]);
  const loPts = lo.map((v, i) => [sx(i), sy(v)] as [number, number]).reverse();
  els.push(<path key="band" d={poly(upPts) + ' L' + poly(loPts).slice(1) + ' Z'} fill={targetColor} fillOpacity={0.1} />);
  els.push(<path key="mid" d={poly(mid.map((v, i) => [sx(i), sy(v)]))} fill="none" stroke={targetColor} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.55} />);
  els.push(<path key="act" d={smooth(actual.map((v, i) => [sx(i), sy(v)]))} fill="none" stroke={actualColor} strokeWidth={2.4} strokeLinecap="round" />);
  els.push(<circle key="ld" cx={round(sx(n - 1))} cy={round(sy(actual[n - 1]))} r={3.5} fill={actualColor} />);

  if (todayIndex != null && todayIndex >= 0 && todayIndex < n) {
    const tx = sx(todayIndex);
    els.push(<line key="today" x1={round(tx)} x2={round(tx)} y1={y0 - 4} y2={y1} stroke={INK} strokeWidth={1.5} strokeDasharray="3 3" strokeOpacity={0.65} />);
    els.push(<rect key="today-badge" x={round(tx - 19)} y={y0 - 16} width={38} height={14} rx={7} fill={INK} />);
    els.push(<text key="today-label" x={round(tx)} y={y0 - 6} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--av-surface)">TODAY</text>);
  }

  (weekLabels ?? []).forEach((lb, i) => lb && els.push(<text key={`x${i}`} x={round(sx(i))} y={hh - 7} textAnchor="middle" fontSize={9} fill={MUTED}>{lb}</text>));

  const ly = 10;
  els.push(<rect key="k1" x={x0} y={ly - 7} width={14} height={8} rx={2} fill={targetColor} fillOpacity={0.18} />);
  els.push(<text key="k1t" x={x0 + 18} y={ly} fontSize={9} fill={MID}>Expected range</text>);
  els.push(<line key="k2" x1={x0 + 114} x2={x0 + 130} y1={ly - 3} y2={ly - 3} stroke={targetColor} strokeWidth={1.5} strokeDasharray="4 3" />);
  els.push(<text key="k2t" x={x0 + 134} y={ly} fontSize={9} fill={MID}>Target</text>);
  els.push(<line key="k3" x1={x0 + 172} x2={x0 + 188} y1={ly - 3} y2={ly - 3} stroke={actualColor} strokeWidth={2.4} />);
  els.push(<text key="k3t" x={x0 + 192} y={ly} fontSize={9} fill={MID}>{actualLabel}</text>);

  return <div className={className}><svg viewBox={`0 0 ${w} ${hh}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}

// ── Boxplot ─────────────────────────────────────────────────
export interface BoxStat { label: string; min: number; q1: number; med: number; q3: number; max: number; outliers?: number[]; color?: string }

export function BoxPlotChart({ data, valueFormat = 'dollars', max, className }: { data: BoxStat[]; valueFormat?: 'dollars' | 'number'; max?: number; className?: string }) {
  const w = 600, hh = 200, x0 = 34, x1 = w - 12, y0 = 14, y1 = hh - 22;
  const ymax = max ?? Math.ceil(Math.max(...data.flatMap((g) => [g.max, ...(g.outliers ?? [])])) * 1.1);
  const n = data.length, step = (x1 - x0) / n, bw = step * 0.4;
  const sy = (v: number) => y1 + (y0 - y1) * v / ymax;
  const vf = valueFormat === 'dollars' ? (v: number) => '$' + Math.round(v) : (v: number) => fmt.number(v);
  const els: React.ReactNode[] = [];
  for (let k = 0; k <= 4; k++) { const v = ymax * k / 4, yy = y1 + (y0 - y1) * v / ymax; els.push(<line key={`g${k}`} x1={x0} x2={x1} y1={round(yy)} y2={round(yy)} stroke={GRID} strokeWidth={1} />); els.push(<text key={`gl${k}`} x={x0 - 6} y={round(yy) + 3} textAnchor="end" fontSize={9} fill={MUTED} style={TAB}>{vf(v)}</text>); }
  data.forEach((g, i) => {
    const cx = x0 + step * i + step / 2, col = g.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
    els.push(<line key={`wk${i}`} x1={cx} x2={cx} y1={round(sy(g.max))} y2={round(sy(g.min))} stroke={col} strokeWidth={1.5} />);
    els.push(<line key={`wt${i}`} x1={cx - 6} x2={cx + 6} y1={round(sy(g.max))} y2={round(sy(g.max))} stroke={col} strokeWidth={1.5} />);
    els.push(<line key={`wb${i}`} x1={cx - 6} x2={cx + 6} y1={round(sy(g.min))} y2={round(sy(g.min))} stroke={col} strokeWidth={1.5} />);
    els.push(<rect key={`bx${i}`} x={round(cx - bw / 2)} y={round(sy(g.q3))} width={round(bw)} height={round(sy(g.q1) - sy(g.q3))} rx={3} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={1.5} />);
    els.push(<line key={`md${i}`} x1={round(cx - bw / 2)} x2={round(cx + bw / 2)} y1={round(sy(g.med))} y2={round(sy(g.med))} stroke={col} strokeWidth={2.4} />);
    (g.outliers ?? []).forEach((o, oi) => els.push(<circle key={`ot${i}-${oi}`} cx={cx} cy={round(sy(o))} r={2.6} fill="none" stroke={col} strokeWidth={1.4} />));
    els.push(<text key={`bl${i}`} x={cx} y={hh - 7} textAnchor="middle" fontSize={9.5} fill={MUTED}>{g.label}</text>);
  });
  return <div className={className}><svg viewBox={`0 0 ${w} ${hh}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}
