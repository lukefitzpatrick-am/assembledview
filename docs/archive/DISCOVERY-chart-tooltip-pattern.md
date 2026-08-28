# DISCOVERY — Chart tooltip pattern

**Date:** 2026-07-09  
**Scope:** Read-only. Tooltip usage across chart components; hover state in `domain-charts.tsx`.  
**Goal:** Identify the dominant tooltip look/behaviour for Recharts charts so `MediaGanttChart` can match it.

---

## Step 1 — Tooltip usage in charts

### Search command

```powershell
Get-ChildItem -Recurse -Include *.tsx,*.ts -Exclude node_modules | Select-String -Pattern "Tooltip" -List | Select-Object Path
```

### Chart-related hits (non-exhaustive filter)

| File | Chart-related? | Tooltip type |
|------|----------------|--------------|
| `components/charts/system/bar-charts.tsx` | Yes | Recharts `ChartTooltip` + `ChartTooltipContent` |
| `components/charts/system/composition-charts.tsx` | Yes | Recharts `ChartTooltip` + `ChartTooltipContent` |
| `components/charts/system/flow-charts.tsx` | Yes | Mixed: `ChartTooltip` + `ChartTooltipContent` (Waterfall); bare Recharts `<Tooltip />` (Sankey) |
| `components/charts/system/line-charts.tsx` | Yes | Recharts `ChartTooltip` + `ChartTooltipContent` |
| `components/charts/system/relation-charts.tsx` | Yes | Recharts `ChartTooltip` + `ChartTooltipContent` |
| `components/charts/system/domain-charts.tsx` | Yes (SVG) | **None** |
| `components/charts/system/custom-charts.tsx` | Yes (SVG) | **None** |
| `components/ui/chart.tsx` | Yes (shared primitive) | Defines `ChartTooltip` / `ChartTooltipContent` |
| `lib/charts/theme.ts` | Yes (container tokens) | Tooltip **cursor** styling only; no tooltip content tokens |
| `lib/chart-theme.ts` | Yes (imports `ChartConfig` type) | No tooltip tokens |
| `components/ui/tooltip.tsx` | UI primitive | Radix/shadcn — **not used by chart components** |
| `components/dashboard/DashboardOverview.tsx` | No (KPI chrome) | Radix `Tooltip` on metric tiles |
| `components/dashboard/HeroBanner.tsx` | No (action buttons) | Radix `Tooltip` |

Ignored as non-chart: billing grids, expert grids, sidebar, mediaplan libs, `node_modules`.

---

## Dominant pattern

**Recharts `<ChartTooltip>` with custom `<ChartTooltipContent>`** from `components/ui/chart.tsx`.

- `ChartTooltip` is a direct alias: `const ChartTooltip = RechartsPrimitive.Tooltip` (line 105).
- `ChartTooltipContent` is a custom content renderer passed via the `content` prop.
- **14 call sites** across 5 Recharts chart modules use `ChartTooltip` + `ChartTooltipContent`.
- **1 outlier:** `SankeyChart` uses bare Recharts `<Tooltip />` with no custom content (default Recharts styling).

Radix `Tooltip` from `components/ui/tooltip.tsx` is used on dashboard KPI tiles and hero actions, not on data charts.

`UnifiedTooltip` is referenced only in a comment in `chart.tsx` (line 9); **no such component exists** in the repo.

---

## Shared component / tokens

### Primary shared primitive — `components/ui/chart.tsx`

**Shell class (not exported; applied inside `ChartTooltipContent`):**

```10:11:components/ui/chart.tsx
const CHART_TOOLTIP_CONTENT_CLASS =
  "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-xl" as const
```

**Tooltip alias and content component (verbatim structure):**

```105:264:components/ui/chart.tsx
const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart()
    // ... label derivation ...
    if (!active || !payload?.length) {
      return null
    }
    const nestLabel = payload.length === 1 && indicator !== "dot"
    return (
      <div
        ref={ref}
        className={cn(CHART_TOOLTIP_CONTENT_CLASS, className)}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            // ... per-series row with optional dot/line/dashed indicator ...
            return (
              <div
                key={item.dataKey ?? index}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}
              >
                {/* indicator div: shrink-0 rounded-[2px], h-2.5 w-2.5 for dot */}
                <div
                  className={cn(
                    "flex flex-1 justify-between leading-none",
                    nestLabel ? "items-end" : "items-center"
                  )}
                >
                  <div className="grid gap-1.5">
                    {nestLabel ? tooltipLabel : null}
                    {(itemConfig?.label || item.name) ? (
                      <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                    ) : null}
                  </div>
                  {formattedValue != null ? (
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formattedValue}
                    </span>
                  ) : item.value != null && item.value !== "" ? (
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {item.value.toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
```

**Label row styling:**

```153:163:components/ui/chart.tsx
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        )
      }
      if (!value) {
        return null
      }
      return <div className={cn("font-medium", labelClassName)}>{value}</div>
```

**Coupling note (factual):** `ChartTooltipContent` calls `useChart()` and expects Recharts-injected props (`active`, `payload`, `label`, `formatter`, etc.). It must render inside `<ChartContainer>`. It is not a standalone hover div.

### Visual spec summary (from `CHART_TOOLTIP_CONTENT_CLASS` + inner rows)

| Property | Token / class |
|----------|----------------|
| Background | `bg-popover` |
| Text | `text-popover-foreground` (shell), `text-muted-foreground` (series name), `text-foreground` (value) |
| Border | `border border-border/50` |
| Radius | `rounded-lg` |
| Shadow | `shadow-xl` |
| Padding | `px-2.5 py-1.5` |
| Font size | `text-xs` (shell) |
| Value font | `font-mono font-medium tabular-nums` |
| Layout | `grid min-w-[8rem] items-start gap-1.5`; rows `grid gap-1.5`; row flex `gap-2` |
| Indicator | `h-2.5 w-2.5 shrink-0 rounded-[2px]` dot, coloured via inline `--color-bg` / `--color-border` |

### Container-level tooltip cursor tokens — `lib/charts/theme.ts`

No tooltip **content** tokens. Only Recharts hover-cursor styling on the chart surface:

```27:36:lib/charts/theme.ts
  return cn(
    "flex aspect-video justify-center text-xs",
    `[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground`,
    `[&_.recharts-cartesian-grid_line[stroke='${grid}']]:stroke-border/50`,
    "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
    `[&_.recharts-dot[stroke='${dot}']]:stroke-transparent`,
    "[&_.recharts-layer]:outline-none",
    `[&_.recharts-polar-grid_[stroke='${grid}']]:stroke-border`,
    "[&_.recharts-radial-bar-background-sector]:fill-muted",
    "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted",
```

### Consumers of `ChartTooltip` / `ChartTooltipContent`

| File | Usages |
|------|--------|
| `line-charts.tsx` | 3 (`LineChart`, `AreaChart`, `StackedAreaChart` / `StepChart` / `Sparkline` family) |
| `bar-charts.tsx` | 3 |
| `relation-charts.tsx` | 3 |
| `composition-charts.tsx` | 4 (`PieChart`, `DonutChart`, `TreemapChart`, `FunnelChart`) |
| `flow-charts.tsx` | 1 (`WaterfallChart` only) |

**Representative usage (line charts):**

```64:64:components/charts/system/line-charts.tsx
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => vf(Number(v))} />} />
```

**Only tooltip className override in chart system (Treemap — maps shadcn semantic colours to `--av-*` ink/axis):**

```181:188:components/charts/system/composition-charts.tsx
        <ChartTooltip
          content={
            <ChartTooltipContent
              nameKey="name"
              formatter={(v) => vf(Number(v))}
              className="text-[var(--av-ink)] [&_.text-muted-foreground]:text-[var(--av-axis)] [&_.text-foreground]:text-[var(--av-ink)]"
            />
          }
        />
```

### Secondary pattern — Radix shadcn tooltip (non-chart UI)

`components/ui/tooltip.tsx`:

```14:27:components/ui/tooltip.tsx
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
```

Visual differences vs chart tooltip: `rounded-md` (not `rounded-lg`), `px-3` (not `px-2.5`), `text-sm` (not `text-xs`), `shadow-md` (not `shadow-xl`), `border` without `/50`, enter/exit animations.

### Outlier — Sankey default Recharts tooltip

```95:108:components/charts/system/flow-charts.tsx
export function SankeyChart({ data, className }: { data: SankeyData; className?: string }) {
  return (
    <ChartContainer config={{}} className={className}>
      <Sankey
        data={data}
        node={<SankeyNode />}
        nodePadding={26} nodeWidth={12}
        link={{ stroke: 'var(--av-chart-1)', strokeOpacity: 0.22 } as any}
        margin={{ top: 8, right: 90, bottom: 8, left: 60 }}
      >
        <Tooltip />
      </Sankey>
    </ChartContainer>
  );
}
```

Uses Recharts' built-in default tooltip content (not `ChartTooltipContent`).

---

## Step 2 — Hover interactivity in `domain-charts.tsx`

### Mouse / pointer events

**No matches** for `onMouseEnter`, `onMouseMove`, `onMouseLeave`, `onPointerEnter`, `pointer-events`, or `Tooltip` in `components/charts/system/domain-charts.tsx`.

All five SVG components (`MediaGanttChart`, `BurstGrid`, `MatrixHeatmap`, `PacingBandChart`, `BoxPlotChart`) are static render-only: they push `<rect>`, `<text>`, `<line>`, `<path>` elements into an array and return a bare `<svg>` with no event handlers.

### BurstGrid and siblings

`BurstGrid` (lines 89–108): no tooltip, no hover treatment, no `cursor` style on burst rects.

Same for `MatrixHeatmap`, `PacingBandChart`, `BoxPlotChart`, and `custom-charts.tsx` SVG charts (`SunburstChart`, `MarimekkoChart`, `CalendarHeatmap`): zero hover/tooltip precedent in the hand-rolled SVG tier.

---

## Step 3 — Positioning mechanism

### Dominant pattern (Recharts charts)

**Positioning is handled by Recharts**, not by app code. The app supplies only the content renderer via `content={<ChartTooltipContent ... />}`.

Mechanism:

1. `ChartTooltip` = `RechartsPrimitive.Tooltip` (Recharts internal `TooltipBoundingBox` tracks active coordinate and renders content in a positioned wrapper).
2. `ChartTooltipContent` returns `null` when `!active || !payload?.length`; otherwise returns a `<div>` with tooltip styling. It does not set `position`, `top`, `left`, or track cursor coordinates.
3. No portal/popper in app code for chart tooltips.

### Radix pattern (dashboard KPIs — not charts)

**Positioning handled by Radix** (`@radix-ui/react-tooltip`): `TooltipContent` portals and uses Popper (`sideOffset`, `side` prop on triggers). Example from `DashboardOverview.tsx`:

```2734:2757:components/dashboard/DashboardOverview.tsx
          <TooltipProvider delayDuration={200}>
            {metrics.map((metric) => (
              <MetricCard key={metric.id} ...>
                <Tooltip>
                  <TooltipTrigger asChild>
                    ...
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{metric.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </MetricCard>
            ))}
          </TooltipProvider>
```

### Hand-rolled SVG charts

**No existing positioning approach** in `domain-charts.tsx` or `custom-charts.tsx`. No manual absolute-div cursor tracking anywhere in `components/charts/`.

---

## Summary for Gantt tooltip build

| Question | Answer |
|----------|--------|
| Dominant chart tooltip pattern | Recharts `ChartTooltip` + `ChartTooltipContent` from `components/ui/chart.tsx` |
| Shared style source | `CHART_TOOLTIP_CONTENT_CLASS` + inner row classes in `ChartTooltipContent` (not exported; duplicated or component reused with adapter) |
| Shared tokens in `lib/charts/theme.ts` | Cursor/highlight only; no tooltip shell tokens |
| Reusable component? | `ChartTooltipContent` exists but is Recharts-coupled (`useChart`, `payload` shape) |
| Existing hover in `domain-charts.tsx` | None |
| BurstGrid precedent | None |
| Positioning for Recharts charts | Library-managed |
| Alternative patterns | Radix tooltip (dashboard UI, different visual spec); Sankey bare `<Tooltip />` (1 chart, default Recharts look) |

**Stop condition:** One clear dominant pattern for data charts (`ChartTooltipContent`). Radix and Sankey default are secondary/outlier; not ambiguous enough to block.
