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
 *     toolbar={<ChartExportToolbar onCsv={...} onPng={...} />}
 *     legend={<ToggleableLegend items={items} hidden={hidden} onToggle={setHidden} />}
 *   >
 *     <BarChart ... />
 *   </BaseChartCard>
 */
import * as React from 'react';

// ── BaseChartCard (a.k.a. ChartShell) ───────────────────────
export interface BaseChartCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  toolbar?: React.ReactNode;
  legend?: React.ReactNode;
  /** ref'd wrapper around the chart — used by exportPng */
  bodyRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
  className?: string;
}

export function BaseChartCard({ title, subtitle, toolbar, legend, bodyRef, children, className }: BaseChartCardProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--av-grid)', borderRadius: 14, overflow: 'hidden', background: 'var(--av-surface)', boxShadow: '0 1px 3px rgba(15,29,19,.08)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--av-grid)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--av-ink)', letterSpacing: '-0.01em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: 'var(--av-axis)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {toolbar}
      </div>
      {legend && <div style={{ padding: '10px 16px 0' }}>{legend}</div>}
      <div ref={bodyRef} style={{ padding: '8px 14px 14px' }}>{children}</div>
    </div>
  );
}

// ── ChartExportToolbar ──────────────────────────────────────
export interface ChartExportToolbarProps {
  onCsv?: () => void;
  onPng?: () => void;
  extra?: { label: string; onClick: () => void }[];
}

function ToolbarButton({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--av-grid)', background: 'var(--av-surface)', fontSize: 11, fontWeight: 600, color: 'var(--av-label)', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

export function ChartExportToolbar({ onCsv, onPng, extra = [] }: ChartExportToolbarProps) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {onCsv && <ToolbarButton onClick={onCsv}>CSV</ToolbarButton>}
      {onPng && <ToolbarButton onClick={onPng}>PNG</ToolbarButton>}
      {extra.map((e) => <ToolbarButton key={e.label} onClick={e.onClick}>{e.label}</ToolbarButton>)}
    </div>
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
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((it) => {
        const on = !hidden.has(it.key);
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onToggle(it.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, border: '1px solid var(--av-grid)', background: 'var(--av-surface)', opacity: on ? 1 : 0.5, fontSize: 11, fontWeight: 600, color: 'var(--av-label)', cursor: 'pointer' }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color }} />
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
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onSelect(it.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 99,
            border: '1px solid var(--av-grid)',
            background: 'var(--av-surface)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--av-label)',
            cursor: 'pointer',
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color }} />
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
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

/**
 * Render the first <svg> inside `el` to a PNG download.
 * Works for both the Recharts charts and the custom-SVG ones.
 */
export async function exportPng(el: HTMLElement | null, filename = 'chart.png', scale = 2) {
  if (!el) return;
  const svg = el.querySelector('svg');
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const w = rect.width || 600, h = rect.height || 400;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  const canvas = document.createElement('canvas');
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  canvas.toBlob((blob) => blob && triggerDownload(blob, filename), 'image/png');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
