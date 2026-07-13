# DISCOVERY — Gantt timeline label/bar overlap

Read-only investigation of the media plan **Timeline (Gantt)** view: label gutter layout, bar positioning, header alignment, export path, and label string construction.

**Scope:** Campaign dashboard media plan timeline (`MediaPlanVizSection` → `MediaGanttChart`).  
**Date:** 2026-07-09

---

## Step 1 — Candidate implementations

### Search results

- `Select-String -Pattern "Download PNG"` (repo-wide, excluding `node_modules`): **no matches** in source `.ts`/`.tsx` files (the string lives in `MediaPlanVizSection.tsx` as `{exporting ? "Exporting…" : "Download PNG"}` — confirmed via codebase read).
- `Select-String -Pattern "Monthly"`: many hits; timeline-relevant files identified below.

### Gantt / timeline candidates in repo

| Path | Role | Distinct implementation? |
|------|------|--------------------------|
| `components/charts/system/domain-charts.tsx` | **`MediaGanttChart`** — hand-rolled SVG Gantt (labels + bars + header) | **Yes — primary renderer** |
| `app/dashboard/[slug]/[mba_number]/components/MediaGanttChart.tsx` | Dashboard wrapper: reshape data, scroll container, passes props to library | Wrapper only |
| `components/dashboard/campaign/mediaGanttReshape.ts` | Date → week/month index, builds `GanttRow[]` | Data shaping only |
| `components/dashboard/campaign/MediaPlanVizSection.tsx` | Timeline/Table/Summary tabs, Weekly/Monthly toggle, **Download PNG** | Shell / export host |
| `components/media-containers/MediaContainerTimelineCollapsible.tsx` | Edit-page “Schedule preview” collapsible | Reuses dashboard `MediaGanttChart` (weekly default) |
| `components/charts/system/domain-charts.tsx` | **`BurstGrid`** — smaller week grid for expert editor | **Separate** SVG component (`padL = 84`) |
| `lib/utils/weeklyGanttColumns.ts` | Week column helpers for Expert Mode grids | Not used by campaign `MediaGanttChart` |
| `app/(internal)/chart-gallery/page.tsx` | Internal demo of `MediaGanttChart` | Demo only |

**Conclusion:** The campaign media plan Timeline uses **one** Gantt renderer (`MediaGanttChart` in `domain-charts.tsx`). `BurstGrid` is a related but separate expert-editor visualization. Investigation proceeds on the primary chain.

### Render tree (campaign Timeline)

```
CampaignPageAssembly.tsx
  └─ MediaPlanVizSection.tsx          (tabs, Weekly/Monthly, PNG export, ref on timeline)
       └─ MediaGanttChart.tsx         (dashboard wrapper, data-export root, overflow)
            └─ mediaGanttReshape.ts   (reshapeLineItemsToMediaGantt)
            └─ domain-charts.tsx      MediaGanttChart (SVG: labels, header, bars)
```

### Files involved (full paths)

| File | Responsibility |
|------|----------------|
| `app/dashboard/[slug]/[mba_number]/components/CampaignPageAssembly.tsx` | Mounts `MediaPlanVizSection` on campaign page |
| `components/dashboard/campaign/MediaPlanVizSection.tsx` | View switcher, granularity state, `html2canvas` PNG export |
| `app/dashboard/[slug]/[mba_number]/components/MediaGanttChart.tsx` | Export root `data-export="media-plan-gantt-root"`, passes reshaped props |
| `components/dashboard/campaign/mediaGanttReshape.ts` | Campaign window, week/month indexing, `GanttRow` construction |
| `components/charts/system/domain-charts.tsx` | SVG layout, label drawing, bar drawing, month header |
| `components/charts/system/index.ts` | Re-exports `MediaGanttChart`, `GanttRow`, `GanttBurst` |
| `lib/mediaplan/normalizeLineItem.ts` | `buildGanttSidelineLabel`, `NormalisedLineItem` |
| `lib/charts/registry.ts` | `getMediaLabel` → channel display name (e.g. “Programmatic Display”) |
| `lib/chart-theme.ts` | `channelColorFor`, chart colour tokens (imported by reshape + SVG) |
| `lib/mediaplan/serializeLineItemsForGantt.ts` | Used by edit-page collapsible only |
| `components/media-containers/MediaContainerTimelineCollapsible.tsx` | Secondary consumer of same `MediaGanttChart` |

**Third-party charting library:** None for this Gantt. Implementation is **pure SVG** in `domain-charts.tsx` (“zero extra dependencies”, no Recharts/ECharts for this component).

---

## Layout mechanism

### How the label gutter vs chart area split works

**Not CSS grid, flex, or table.** The split is **fixed SVG coordinates** inside a single `<svg viewBox="0 0 W H" width="100%">`.

Constants in `MediaGanttChart`:

```47:50:components/charts/system/domain-charts.tsx
  const W = 1180, headH = 44, padL = 160, x1 = W - 16;
  const H = headH + rows.length * rowHeight + 8;
  const weekW = (x1 - padL) / weeks;
  const wx = (w: number) => padL + weekW * w;
```

- **Label gutter:** x = `0` … `padL` (160 SVG units). No separate DOM column.
- **Chart / bar area:** x = `padL` (160) … `x1` (1164). Bar horizontal positions use `wx(weekIndex)`.
- **Row zebra backgrounds** span full `W` (1180), including the gutter.

### Label column width

**Fixed at `padL = 160` pixels (viewBox units).** Not percentage, not content-driven, no min/max CSS. Comment in `lib/charts/theme.ts` notes “MediaGanttChart keeps a local Excel-parity constant” (the constant itself is inline in `domain-charts.tsx`, not imported from theme).

### Label + bar DOM/SVG structure

Labels and bars are **siblings in the same SVG**, drawn per row in paint order:

```64:75:components/charts/system/domain-charts.tsx
  rows.forEach((row, ri) => {
    const y = headH + ri * rowHeight;
    const color = row.color ?? CHANNEL_COLORS[(row.sub ?? '').toLowerCase()] ?? CHART_PALETTE[ri % CHART_PALETTE.length];
    els.push(<rect key={`sw${ri}`} x={14} y={round(y + rowHeight / 2 - 7)} width={4} height={14} rx={2} fill={color} />);
    els.push(<text key={`rl${ri}`} x={26} y={round(y + rowHeight / 2 - 1)} fontSize={12} fontWeight={700} fill={INK}>{row.label}</text>);
    if (row.sub) els.push(<text key={`rs${ri}`} x={26} y={round(y + rowHeight / 2 + 12)} fontSize={9.5} fill={MUTED}>{row.sub}</text>);
    row.bursts.forEach((b, bi) => {
      const bx = wx(b.startWeek), bw = weekW * (b.endWeek - b.startWeek) - 3, by = y + rowHeight / 2 - 9, bh = 18;
      els.push(<rect key={`bg${ri}-${bi}`} x={round(bx + 1)} y={round(by)} width={round(bw)} height={bh} rx={5} fill={color} fillOpacity={0.16} />);
      els.push(<rect key={`bf${ri}-${bi}`} x={round(bx + 1)} y={round(by)} width={round(bw)} height={bh} rx={5} fill={color} fillOpacity={(b.intensity ?? 0.85) * 0.92} />);
      if (bw > 48 && b.label) els.push(<text key={`bl${ri}-${bi}`} x={round(bx + 9)} y={round(by + 12.5)} fontSize={10} fontWeight={700} fill="#fff" style={TAB}>{b.label}</text>);
    });
  });
```

**Implications:**

- Primary label (`row.label`) at **x=26**; secondary (`row.sub`) at **x=26**, +12px lower.
- Channel colour strip: **x=14**, width 4.
- Bars start at **`wx(startWeek)` ≥ padL** when `startWeek === 0`.
- **Paint order:** label text is drawn **before** bar rects, so bar fills render **on top** of any label text that extends past x≈160.
- **No `<clipPath>`** on the gutter; long labels can extend into the chart coordinate space.

### Outer HTML wrapper (scroll, not layout split)

```38:57:app/dashboard/[slug]/[mba_number]/components/MediaGanttChart.tsx
  return (
    <div
      ref={ref}
      data-export="media-plan-gantt-root"
      className={cn(
        "w-full overflow-x-auto rounded-card border border-border bg-background",
        granularity === "monthly" ? "overflow-hidden" : undefined,
      )}
      role="region"
      aria-label={`Campaign media timeline, ${gantt.rows.length} rows, ${granularity === "monthly" ? "month view" : "week view"}`}
    >
      <LibraryMediaGanttChart
        rows={gantt.rows}
        weeks={gantt.weeks}
        months={gantt.months}
        weeksPerMonth={gantt.weeksPerMonth}
        todayWeek={gantt.todayWeek}
        className="min-w-full"
      />
    </div>
  )
```

The wrapper only sets `w-full`, horizontal overflow, and `min-w-full` on the SVG host — it does **not** define a separate label column in HTML.

### Truncation handling on labels

| Element | Truncation classes | Notes |
|---------|-------------------|--------|
| Primary label (`row.label`) | **None** | Raw SVG `<text>`, no `truncate`, `overflow-hidden`, `text-ellipsis`, `line-clamp`, or `whitespace-nowrap` |
| Secondary label (`row.sub`) | **None** | Same |
| Bar inner label (`b.label`) | **None** | Omitted when `bw <= 48` (width gate only) |

There is **no `title` attribute, `<title>` SVG element, or tooltip** on sideline label `<text>` nodes.

`MediaPlanVizSection.prepareMediaPlanExportClone` strips `.truncate` and `.line-clamp-*` on cloned DOM for PNG export, but those classes are **not applied** to Gantt sideline labels in the current SVG implementation.

### User-reported “truncate mid-word”

The sideline label is not ellipsized in code. Apparent truncation is likely from:

1. **Horizontal overflow** on the outer `overflow-x-auto` container clipping the scaled SVG viewport edge, and/or  
2. **Visual overlap** where long `<text>` extends past the 160px gutter and is **partially covered** by bar rects drawn afterward.

---

## Bar maths

### Coordinate space

Bar horizontal positions use the **chart area only** (`padL` … `x1`), not the full `W`.

```49:50:components/charts/system/domain-charts.tsx
  const weekW = (x1 - padL) / weeks;
  const wx = (w: number) => padL + weekW * w;
```

```71:71:components/charts/system/domain-charts.tsx
      const bx = wx(b.startWeek), bw = weekW * (b.endWeek - b.startWeek) - 3, by = y + rowHeight / 2 - 9, bh = 18;
```

- **`startWeek` / `endWeek`:** 0-based indices; `endWeek` is **exclusive** (per `GanttBurst` interface, line 23).
- **Left offset:** `bx = padL + weekW * startWeek` (plus `+1` px on rects).
- **Width:** `weekW * (endWeek - startWeek) - 3`.
- **Hard-coded offsets:** `padL = 160`, `x1 = W - 16`, bar `y` centered in `rowHeight` (default 38), bar height 18.

### Date range (min/max)

Derived from **campaign `startDate` / `endDate`** passed into reshape (from campaign page), not a fixed chart window.

```108:120:components/dashboard/campaign/mediaGanttReshape.ts
  const safeStart = safeParseDate(startDate)
  const safeEnd = safeParseDate(endDate)
  if (!safeStart || !safeEnd) return null

  const start = startOfDay(safeStart)
  const end = endOfDay(safeEnd)
  const allDays = eachDayOfInterval({ start, end })
  if (allDays.length === 0) return null

  const isMonthly = granularity === "monthly"
  const sunWeeks = chunkDaysIntoWeeks(allDays)
  const monthStarts = eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) })
  const totalWeeks = isMonthly ? Math.max(1, monthStarts.length) : Math.max(1, sunWeeks.length)
```

Line-item bursts are **clamped** to the campaign window; bursts wholly outside are skipped.

### Week index mapping (weekly mode)

```157:163:components/dashboard/campaign/mediaGanttReshape.ts
        if (isMonthly) {
          startWeek = indexOfMonth(clampedStart, monthStarts)
          endWeek = indexOfMonth(clampedEnd, monthStarts) + 1
        } else {
          startWeek = indexOfWeek(clampedStart, sunWeeks)
          endWeek = indexOfWeek(clampedEnd, sunWeeks) + 1
        }
```

Weekly buckets: **Sunday-start weeks** via `chunkDaysIntoWeeks` (lines 51–67).

### Month index mapping (monthly mode)

Each calendar month in the campaign interval is **one column** (`weeksPerMonth = 1`, `totalWeeks = monthStarts.length`).

### Intensity / bar label

```179:185:components/dashboard/campaign/mediaGanttReshape.ts
      pendingBursts.forEach(({ burst, deliverables }) => {
        bursts.push({
          ...burst,
          intensity:
            deliverables > 0 ? Math.max(0.35, deliverables / intensityBase) : 0.75,
        })
      })
```

Bar text label (`burst.label`): deliverable count (rounded en-AU) or date range `d/M–d/M` (see `burstLabel`, lines 83–90).

---

## Header alignment

### Month header cells

Same `wx()` / `weekW` as bars:

```56:60:components/charts/system/domain-charts.tsx
  months.forEach((m, i) => {
    const mx = wx(i * weeksPerMonth);
    els.push(<rect key={`mb${i}`} x={round(mx)} y={8} width={round(weekW * weeksPerMonth - 3)} height={20} rx={5} fill={i % 2 ? 'var(--av-grid)' : 'var(--av-subsurface)'} />);
    els.push(<text key={`mt${i}`} x={round(mx + weekW * weeksPerMonth / 2)} y={22} textAnchor="middle" fontSize={10} fontWeight={700} fill={MID} letterSpacing=".06em">{m.toUpperCase()}</text>);
  });
```

### Week grid lines

```61:63:components/charts/system/domain-charts.tsx
  for (let w = 0; w <= weeks; w++) {
    els.push(<line key={`wk${w}`} x1={round(wx(w))} x2={round(wx(w))} y1={headH - 4} y2={H - 6} stroke="var(--av-grid)" strokeWidth={1} />);
  }
```

### Gutter in header row

- Header month bands begin at **`wx(0) = padL`**. The region **0–160** in the header has **no month labels** (implicit gutter).
- Row sideline labels occupy the same **0–160** band vertically below `headH` (44).
- **Same `padL` constant** aligns header grid and row bars; there is no separate header gutter width.

### `weeksPerMonth` (weekly mode)

```122:128:components/dashboard/campaign/mediaGanttReshape.ts
  const monthLabels = monthStarts.map((m) => format(m, "MMM"))
  const weeksPerMonth = isMonthly ? 1 : Math.max(1, Math.ceil(totalWeeks / Math.max(1, monthLabels.length)))

  const paddedMonthLabels =
    weeksPerMonth * monthLabels.length < totalWeeks
      ? [...monthLabels, ...Array(Math.ceil(totalWeeks / weeksPerMonth) - monthLabels.length).fill(monthLabels.at(-1) ?? "")]
      : monthLabels
```

In weekly mode, month headers span **`weeksPerMonth` week columns** each (approximate calendar grouping, not independent sizing).

---

## Weekly / Monthly / PNG notes

### Shared layout code

**Yes.** Weekly and monthly both use the same `MediaGanttChart` SVG component and the same `reshapeLineItemsToMediaGantt` function. Only these differ:

| Aspect | Weekly | Monthly |
|--------|--------|---------|
| `totalWeeks` (`weeks` prop) | Sun-start week count | Month count |
| `weeksPerMonth` | `ceil(totalWeeks / monthLabels.length)` | `1` |
| Burst indexing | `indexOfWeek` | `indexOfMonth` |
| `todayWeek` | `differenceInCalendarDays(today, start) / 7` | Fractional position within month column |
| Wrapper overflow | `overflow-x-auto` | `overflow-x-auto` + **`overflow-hidden`** |

Granularity state lives in `MediaPlanVizSection`:

```108:108:components/dashboard/campaign/MediaPlanVizSection.tsx
  const [timelineGranularity, setTimelineGranularity] = useState<"weekly" | "monthly">("weekly")
```

Passed through:

```277:283:components/dashboard/campaign/MediaPlanVizSection.tsx
          <MediaGanttChart
            ref={timelineRef}
            lineItems={normalised}
            startDate={campaignStart || ""}
            endDate={campaignEnd || ""}
            granularity={timelineGranularity}
          />
```

`MediaContainerTimelineCollapsible` does **not** expose granularity; it defaults to **weekly**.

### Download PNG

**Library:** `html2canvas` **^1.4.1** (`package.json`), dynamic import.

**Same DOM** as on-screen timeline — no separate render path. `timelineRef` is attached to the dashboard `MediaGanttChart` wrapper `div`.

```142:176:components/dashboard/campaign/MediaPlanVizSection.tsx
  const handleExportPng = useCallback(async () => {
    const el =
      view === "timeline" ? timelineRef.current : view === "table" ? tableRef.current : summaryRef.current
    if (!el) return
    // ...
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(el, {
        backgroundColor: "hsl(var(--card))",
        scale: 2,
        useCORS: true,
        logging: false,
        onclone: prepareMediaPlanExportClone,
      })
```

`prepareMediaPlanExportClone` (lines 49–96):

- Sets `data-export="media-plan-gantt-root"` overflow to `visible`
- Converts `.sticky` to `position: relative`
- Removes backdrop blur
- Expands `.truncate` / `.line-clamp-*` (not used on Gantt SVG labels today)

Filename includes granularity: `timeline-${timelineGranularity}`.

**Separate hook:** `hooks/useChartExport.ts` also wraps `html2canvas` for generic chart export; the media plan timeline uses the inline handler in `MediaPlanVizSection`, not this hook.

---

## Label construction

### Primary sideline label (`row.label`)

Built in `buildGanttSidelineLabel`:

```32:49:lib/mediaplan/normalizeLineItem.ts
export function buildGanttSidelineLabel(item: NormalisedLineItem): string {
  const publisher = item.publisher || item.platform || item.network || item.site || item.station
  const labelLeft = (publisher ?? "—").trim()
  const bid = cleanLabel(firstNonEmpty(item.bidStrategy))
  if (bid) {
    return `${labelLeft} • ${bid}`
  }
  const placementParts = [
    cleanLabel(item.network),
    cleanLabel(item.site),
    cleanLabel(item.station),
    cleanLabel(item.platform),
  ].filter(Boolean) as string[]
  const leftLower = labelLeft.toLowerCase()
  const deduped = placementParts.filter((p, i) => placementParts.indexOf(p) === i && p.toLowerCase() !== leftLower)
  const labelRight =
    deduped.length > 0 ? deduped.join(" · ") : `Line item ${item.lineItemId || "—"}`
  return `${labelLeft} • ${labelRight}`
}
```

**Fields concatenated:**

1. **Left:** `publisher` → else `platform` → `network` → `site` → `station` → `"—"`
2. **Separator:** ` • ` (bullet, not hyphen)
3. **Right (if `bidStrategy` present):** cleaned `bidStrategy` only
4. **Right (else):** deduped `network` / `site` / `station` / `platform` joined by ` · `, or fallback `Line item {lineItemId}`

Assigned in reshape:

```188:193:components/dashboard/campaign/mediaGanttReshape.ts
      rows.push({
        label: buildGanttSidelineLabel(item),
        sub: getMediaLabel(mediaType),
        color: channelColorFor(mediaType, rowIndex),
        bursts,
      })
```

### Secondary label (`row.sub`)

Channel / media type display name from registry, e.g. `prog_display` → **“Programmatic Display”**:

```173:177:lib/charts/registry.ts
export function getMediaLabel(key: string): string {
  const n = normalizeEntityKey(key)
  const row = MEDIA_TYPE_REGISTRY[n as MediaTypeRegistryKey]
  if (row) return row.label
  return humanizeSnake(n) || key.trim()
}
```

**KPI is not** part of the Gantt sideline label in this code path.

### Realistic maximum label length

- Zod schemas (`lib/mediaplan/schemas.ts`): `publisher` and `bidStrategy` are `z.string()` with `min(1)` where required — **no `.max()`** on those fields.
- Fallback right side can include multiple placement fields joined with ` · `.
- Longest realistic primary string: unbounded in schema; practically `{publisher} • {bidStrategy}` or `{publisher} • {network · site · station · platform}`.
- Secondary `sub`: bounded by registry labels (longest registry entries ≈ **“Programmatic Display”**, **“Programmatic Video”**, etc. — ~20 characters).

Example matching user report (“Quantcast … click…”): would render as **`Quantcast • click...`** (bullet separator), with **“Programmatic Display”** on the secondary line if `mediaType` is `prog_display`.

---

## Anomalies or ambiguities

1. **Multiple Gantt-like components:** `BurstGrid` in the same file is a **separate** expert-editor grid (`padL = 84`, different layout). Campaign timeline and edit “Schedule preview” both use **`MediaGanttChart`**.
2. **No CSS/HTML label column:** Overlap/truncation behaviour is entirely **SVG coordinate + paint order**, not flex/grid misalignment.
3. **Fixed 160px gutter vs unbounded text:** Labels start at x=26 with no clipping; usable text width before `padL` is ~134 units, but SVG does not enforce it — long strings extend into bar area and are **overdrawn by bars**.
4. **User example separator:** Reported `"Quantcast - Direct • click..."` does not match code (` • ` between left and right; publisher fallback chain does not use `" - "`).
5. **“Truncate mid-word”:** No `text-ellipsis` or `line-clamp` on sideline labels; mid-word cut-off is not intentional typography — likely clip/overlap artefact.
6. **No full-text affordance:** No `title`, tooltip, or SVG `<title>` on sideline labels.
7. **Monthly overflow:** Wrapper adds `overflow-hidden` for monthly mode, which may clip horizontal content differently than weekly `overflow-x-auto` only.
8. **SVG scales with `width="100%"`:** Gutter is a **fixed viewBox fraction** (~13.6% of 1180); on narrow viewports the physical gutter shrinks while label strings stay full length in user units → overlap may worsen when scaled.
9. **`Download PNG` search:** Initial repo-wide `Get-ChildItem -Recurse` without excluding `node_modules` did not return promptly; subsequent search excluding `node_modules` and `.next` located the control in `MediaPlanVizSection.tsx`.

---

## Summary table

| Question | Answer |
|----------|--------|
| Layout mechanism | Single SVG; fixed `padL=160` splits gutter vs chart |
| Label/bar relationship | Siblings in one SVG; labels drawn before bars |
| Truncation | None on sideline labels |
| Tooltip on labels | None |
| Bar position | `padL + weekW * startWeek`; width `weekW * (end-start) - 3` |
| Date range | Campaign start/end dates |
| Header alignment | Same `wx()` / `padL` as bars |
| Weekly vs monthly | Same component; reshape changes week indexing |
| PNG export | `html2canvas` on same DOM; clone normalizes overflow/sticky/truncate |
| Label source | `buildGanttSidelineLabel` + `getMediaLabel(mediaType)` as `sub` |
