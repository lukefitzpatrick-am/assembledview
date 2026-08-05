'use client';
/**
 * AssembledView — chart chrome (shell, toolbar, legend, export).
 *
 * These wrap any chart so every card in the app shares one header, one export
 * affordance, and one legend behaviour. Pair with anything from
 * '@/components/charts'.
 *
 *   <BaseChartCard
 *     title="Spend by channel" subtitle="Last 6 months · AUD"
 *     exportPage="dashboard"
 *     exportSeries={{ data, xKey: 'month', seriesKeys: ['Search', 'Social'] }}
 *     legend={<ToggleableLegend items={items} hidden={hidden} onToggle={setHidden} />}
 *   >
 *     <BarChart ... />
 *   </BaseChartCard>
 */
import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  chartExportFilename,
  normalizeChartExportSeries,
  type ChartExportSeriesInput,
} from '@/lib/charts/chartExport';
import { cn } from '@/lib/utils';

export type { ChartExportSeriesInput };

// ── BaseChartCard (a.k.a. ChartShell) ───────────────────────
export interface BaseChartCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Extra header controls (rendered beside the shared export menu). */
  toolbar?: React.ReactNode;
  legend?: React.ReactNode;
  /** ref'd wrapper around the chart — used by exportPng */
  bodyRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
  className?: string;
  /**
   * Page slug for filenames: `{page}-{chart-title-slug}-{yyyymmdd}.{png|csv}`.
   * Defaults to `chart` when omitted.
   */
  exportPage?: string;
  /** Plain-string title for filenames when `title` is a ReactNode. */
  exportTitle?: string;
  /** Series / rows for CSV. PNG always available; CSV omitted when empty. */
  exportSeries?: ChartExportSeriesInput;
  /** Hide the shared Download PNG / CSV menu. */
  hideExport?: boolean;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as React.MutableRefObject<T | null>).current = value;
}

function titleForExport(title: React.ReactNode, exportTitle?: string): string {
  if (exportTitle?.trim()) return exportTitle.trim();
  if (typeof title === 'string' && title.trim()) return title.trim();
  if (typeof title === 'number') return String(title);
  return 'chart';
}

export function BaseChartCard({
  title,
  subtitle,
  toolbar,
  legend,
  bodyRef,
  children,
  className,
  exportPage = 'chart',
  exportTitle,
  exportSeries,
  hideExport = false,
}: BaseChartCardProps) {
  const internalBodyRef = React.useRef<HTMLDivElement | null>(null);
  const setBodyRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      internalBodyRef.current = node;
      assignRef(bodyRef, node);
    },
    [bodyRef]
  );

  const exportLabel = titleForExport(title, exportTitle);
  const normalized = React.useMemo(
    () => (exportSeries ? normalizeChartExportSeries(exportSeries) : null),
    [exportSeries]
  );

  const handlePng = React.useCallback(() => {
    void exportPng(
      internalBodyRef.current,
      chartExportFilename(exportPage, exportLabel, 'png')
    );
  }, [exportPage, exportLabel]);

  const handleCsv = React.useCallback(() => {
    if (!normalized?.rows.length) return;
    exportCsv(
      normalized.rows,
      chartExportFilename(exportPage, exportLabel, 'csv'),
      normalized.columns
    );
  }, [exportPage, exportLabel, normalized]);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-e1',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight text-foreground">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {toolbar}
          {!hideExport ? (
            <ChartExportToolbar
              onPng={handlePng}
              onCsv={normalized?.rows.length ? handleCsv : undefined}
            />
          ) : null}
        </div>
      </div>
      {legend ? <div className="px-4 pb-0 pt-2.5">{legend}</div> : null}
      <div ref={setBodyRef} className="px-3.5 pb-3.5 pt-2">
        {children}
      </div>
    </div>
  );
}

// ── ChartExportToolbar ──────────────────────────────────────
export interface ChartExportToolbarProps {
  onCsv?: () => void;
  onPng?: () => void;
  extra?: { label: string; onClick: () => void }[];
}

/**
 * Shared overflow affordance: Download PNG + Download CSV.
 * Prefer BaseChartCard's built-in wiring; use this only for custom chrome.
 */
export function ChartExportToolbar({ onCsv, onPng, extra = [] }: ChartExportToolbarProps) {
  if (!onCsv && !onPng && extra.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Export chart"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {onPng ? (
          <DropdownMenuItem onSelect={() => onPng()}>Download PNG</DropdownMenuItem>
        ) : null}
        {onCsv ? (
          <DropdownMenuItem onSelect={() => onCsv()}>Download CSV</DropdownMenuItem>
        ) : null}
        {extra.map((e) => (
          <DropdownMenuItem key={e.label} onSelect={() => e.onClick()}>
            {e.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── ToggleableLegend ────────────────────────────────────────
export interface LegendItem { key: string; label: string; color: string }
export interface ToggleableLegendProps {
  items: LegendItem[];
  /** set of hidden keys */
  hidden: Set<string>;
  onToggle: (key: string) => void;
}

export function ToggleableLegend({ items, hidden, onToggle }: ToggleableLegendProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const on = !hidden.has(it.key);
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onToggle(it.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground',
              !on && 'opacity-50'
            )}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: it.color }}
            />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Clickable legend — filters dashboard views instead of toggling visibility. */
export function ChartFilterLegend({
  items,
  onSelect,
}: {
  items: LegendItem[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onSelect(it.key)}
          className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
        >
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: it.color }}
          />
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Controlled hidden-series state for ToggleableLegend. */
export function useLegendToggle(initial: string[] = []) {
  const [hidden, setHidden] = React.useState<Set<string>>(new Set(initial));
  const toggle = React.useCallback((key: string) => {
    setHidden((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }, []);
  return { hidden, toggle };
}

// ── ChartExport — CSV + PNG helpers ─────────────────────────
/** Rows → CSV download. `columns` optional; defaults to keys of the first row. */
export function exportCsv(rows: Record<string, unknown>[], filename = 'chart.csv', columns?: string[]) {
  if (!rows.length) return;
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // BOM helps Excel open UTF-8 correctly; values are raw (not display-formatted).
  const csv = '\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

export type CapturedPng = {
  dataUrl: string
  /** Pixel width of the rendered PNG. */
  width: number
  /** Pixel height of the rendered PNG. */
  height: number
}

/**
 * Render the first <svg> inside `el` to a PNG data URL (or html2canvas fallback).
 * Works for Recharts / custom-SVG charts and HTML tables.
 * Returns pixel dimensions so exporters can preserve aspect ratio.
 */
export async function captureNodePng(
  el: HTMLElement | null,
  scale = 2
): Promise<CapturedPng | null> {
  if (!el) return null

  const svg = el.querySelector("svg")
  if (svg) {
    const clone = svg.cloneNode(true) as SVGSVGElement
    const rect = svg.getBoundingClientRect()
    const w = rect.width || 600
    const h = rect.height || 400
    clone.setAttribute("width", String(w))
    clone.setAttribute("height", String(h))
    const xml = new XMLSerializer().serializeToString(clone)
    const img = new Image()
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml)
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error("SVG image load failed"))
    })
    const canvas = document.createElement("canvas")
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    // Canvas 2D fillStyle cannot resolve CSS variables.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    }
  }

  const html2canvas = (await import("html2canvas")).default
  const canvas = await html2canvas(el, {
    scale,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
  })
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  }
}

/**
 * Render the first <svg> inside `el` to a PNG download.
 * Works for both the Recharts charts and the custom-SVG ones.
 */
export async function exportPng(el: HTMLElement | null, filename = "chart.png", scale = 2) {
  const captured = await captureNodePng(el, scale)
  if (!captured) return
  const res = await fetch(captured.dataUrl)
  const blob = await res.blob()
  triggerDownload(blob, filename)
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
