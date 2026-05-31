# MBA Edit Page — Skeleton Loading Discovery

READ-ONLY discovery for skeleton implementation on the MBA edit route.

---

## Prerequisite checks

### `git branch --show-current`

```
localhost
```

Branch is `localhost` — investigation proceeded.

### `git status`

```
On branch localhost
Untracked files:
  docs/kpi/

nothing added to commit but untracked files present
```

Uncommitted changes: only untracked `docs/kpi/` directory. No staged or modified tracked files at discovery time.

---

## 1. File map

### Edit route `page.tsx` (confirmed path)

Glob result: `app/mediaplans/mba/[mba_number]/edit/page.tsx`

Client component (`"use client"` at line 1):

```1:1:app/mediaplans/mba/[mba_number]/edit/page.tsx
"use client"
```

Default export:

```1313:1313:app/mediaplans/mba/[mba_number]/edit/page.tsx
export default function EditMediaPlan({ params }: { params: Promise<{ mba_number: string }> }) {
```

No `layout.tsx` in the edit route directory (only `page.tsx` and `loading.tsx`).

### Route `loading.tsx` — path and full contents

Path: `app/mediaplans/mba/[mba_number]/edit/loading.tsx`

Server component (no `"use client"`).

Full file:

```1:15:app/mediaplans/mba/[mba_number]/edit/loading.tsx
import { Loader2 } from "lucide-react"

export default function MediaPlanEditLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      <div className="text-center">
        <h2 className="text-xl font-semibold">Loading campaign</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Preparing your media plan editor…
        </p>
      </div>
    </div>
  )
}
```

This is the Next.js App Router instant loading UI (shown before the client page hydrates). It is separate from in-page `loadPhase` states.

### Components with loading-state JSX related to `loadPhase` / line-item loading

| File | `"use client"` | Role |
|------|----------------|------|
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Yes | All `loadPhase` branch rendering, `MediaContainerSuspenseFallback`, per-media spinners, `MediaPlanLoadStatusPill` usage |
| `components/mediaplans/MediaPlanLoadStatusPill.tsx` | Yes | Fixed bottom-right pill listing section load progress (`LoadingDots`) |
| `components/ui/loading-dots.tsx` | Yes | Three animated dots; used by `MediaPlanLoadStatusPill` |

**Local helper (not a separate import):** `MediaContainerSuspenseFallback` is defined inside `page.tsx`:

```1198:1208:app/mediaplans/mba/[mba_number]/edit/page.tsx
function MediaContainerSuspenseFallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-8">
      <div className="relative h-5 w-5 shrink-0">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-t-primary" />
      </div>
      <span className="text-sm text-muted-foreground">Loading {label}…</span>
    </div>
  )
}
```

**Imported but not rendered for page load:**

| File | `"use client"` | Status |
|------|----------------|--------|
| `components/mediaplans/MediaPlanLoadModal.tsx` | Yes | Imported at line 70; **no JSX usage** in `page.tsx` (confirmed via grep — only the import line matches) |

**Imported, no load-phase branches:**

| File | `"use client"` | Notes |
|------|----------------|-------|
| `components/mediaplans/MediaPlanEditorHero.tsx` | Yes | Hero shell; bootstrapping passes a spinner in `detail` prop |
| `components/mediaplans/FloatingSectionNav.tsx` | NOT FOUND in this read | Rendered only in loaded `ready`/post-bootstrapping main return |

Lazy media containers (`TelevisionContainer`, `SearchContainer`, etc.) are imported via `lazy()` in `page.tsx`; they render loaded line-item UI, not `loadPhase` branches.

---

## 2. The `loadPhase` state machine

### Declaration and possible values

```1260:1261:app/mediaplans/mba/[mba_number]/edit/page.tsx
type MediaLoadStatus = "idle" | "loading" | "ready" | "error"
type LoadPhase = "bootstrapping" | "loadingLineItems" | "ready" | "error"
```

```1765:1767:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("bootstrapping")
  const [lineItemLoadItems, setLineItemLoadItems] = useState<SaveStatusItem[]>([])
  const [mediaLoadStatus, setMediaLoadStatus] = useState<Partial<Record<MediaTypeKey, MediaLoadStatus>>>({})
```

### Transitions (setter calls, in order)

| Phase set | File:line | Trigger |
|-----------|-----------|---------|
| `"bootstrapping"` | `page.tsx:2531` | Start of `fetchMediaPlan` when MBA number is valid (after reset) |
| `"error"` | `page.tsx:2734` | API response not OK |
| `"loadingLineItems"` | `page.tsx:2983` | Campaign metadata fetch + form reset succeeded |
| `"error"` | `page.tsx:2995` | Catch block in `fetchMediaPlan` |
| `"ready"` | `page.tsx:3238` | Parallel line-item load: zero enabled media types |
| `"ready"` | `page.tsx:3313` | Parallel line-item load: all fetches settled |

Initial state: `"bootstrapping"` (`page.tsx:1765`).

**Typical happy path:**

1. `"bootstrapping"` — fetch `/api/mediaplans/mba/{mba}?skipLineItems=true…`
2. `"loadingLineItems"` — form populated; parallel per-media API fetches run
3. `"ready"` — all enabled media types fetched (or none enabled)

**Error paths:** `"error"` from failed metadata fetch (`2734`, `2995`).

Setter calls (quoted):

```2530:2532:app/mediaplans/mba/[mba_number]/edit/page.tsx
      setLoading(true)
      setLoadPhase("bootstrapping")
      setLineItemLoadItems([{ name: "Campaign details", status: "pending" }])
```

```2733:2736:app/mediaplans/mba/[mba_number]/edit/page.tsx
          setError(errorMessage)
          setLoadPhase("error")
          setLoading(false)
          setIsLoading(false) // Also set isLoading to false
```

```2981:2985:app/mediaplans/mba/[mba_number]/edit/page.tsx
        if (!isCancelled) {
          updateLoadStatus("Campaign details", "success")
          setLoadPhase("loadingLineItems")
          setLoading(false)
          setIsLoading(true)
```

```2994:2997:app/mediaplans/mba/[mba_number]/edit/page.tsx
        setError("Failed to fetch media plan")
        setLoadPhase("error")
        setLoading(false)
        setIsLoading(false) // Also set isLoading to false
```

```3237:3239:app/mediaplans/mba/[mba_number]/edit/page.tsx
        if (!cancelled) {
          setLoadPhase("ready")
          setIsLoading(false)
```

```3312:3314:app/mediaplans/mba/[mba_number]/edit/page.tsx
      if (!cancelled) {
        setLoadPhase("ready")
        setIsLoading(false)
```

### Every place `loadPhase` is read

#### JSX / rendering

**Early return — bootstrapping:**

```8025:8066:app/mediaplans/mba/[mba_number]/edit/page.tsx
  if (loadPhase === "bootstrapping") {
    return (
      <div
        className="w-full min-h-screen"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        ...
      </div>
    )
  }
```

**Early return — error:**

```8069:8080:app/mediaplans/mba/[mba_number]/edit/page.tsx
  if (loadPhase === "error" || error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => router.push("/mediaplans")} className="mt-4">
            Return to Media Plans
          </Button>
        </div>
      </div>
    )
  }
```

**Per-media section loader (during `loadingLineItems`):**

```8658:8671:app/mediaplans/mba/[mba_number]/edit/page.tsx
                const sectionStatus = mediaLoadStatus[medium.name as MediaTypeKey]
                const showSectionLoader =
                  loadPhase === "loadingLineItems" &&
                  sectionStatus !== "ready" &&
                  sectionStatus !== "error"
                const showSectionError =
                  sectionStatus === "error" ||
                  (sectionStatus === "loading" && loadPhase !== "loadingLineItems")
                
                return (
                  <div key={medium.name} id={`media-section-${medium.name}`} className="mt-4 scroll-mt-24">
                    {showSectionLoader && (
                      <MediaContainerSuspenseFallback label={medium.label} />
                    )}
```

**Status pill:**

```9105:9107:app/mediaplans/mba/[mba_number]/edit/page.tsx
      <MediaPlanLoadStatusPill
        items={lineItemLoadItems}
        isLoading={loadPhase === "loadingLineItems"}
```

#### Effects / logic (not visible UI)

```2040:2042:app/mediaplans/mba/[mba_number]/edit/page.tsx
    if (loadPhase === 'ready' && !isLoading && lineItemLoadItems.length > 0 && !hasLoadErrors) {
      setLineItemLoadItems([])
    }
```

```3195:3197:app/mediaplans/mba/[mba_number]/edit/page.tsx
    if (loadPhase !== "loadingLineItems") {
      return
    }
```

```7330:7330:app/mediaplans/mba/[mba_number]/edit/page.tsx
    if (loadPhase !== "ready") return
```

```7370:7370:app/mediaplans/mba/[mba_number]/edit/page.tsx
    if (loadPhase !== "ready") return
```

### `isLoading` (separate from `loadPhase`)

**Declaration:**

```1364:1364:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const [isLoading, setIsLoading] = useState(true)
```

**Type/shape:** `boolean`.

**Purpose:** Gates save/generate/download busy states and navigation blocking — **not** the bootstrapping early return.

**Set during load sequence:**

- `true` when entering `loadingLineItems` (`2985`)
- `false` when line items complete or error (`2523`, `2736`, `2997`, `3239`, `3314`)
- Also set `true`/`false` during save/generate operations (`6261`, `6293`, `7800`, etc.)

**JSX driven (examples):**

```9093:9095:app/mediaplans/mba/[mba_number]/edit/page.tsx
                disabled={isLoading || isSaving}
              >
                {isLoading || isSaving ? "Saving..." : "Save campaign"}
```

```10135:10147:app/mediaplans/mba/[mba_number]/edit/page.tsx
              disabled={isSaving || isLoading}
              ...
              {isSaving ? "Saving..." : "Save"}
            </Button>
            ...
              disabled={isLoading}
              ...
              {isLoading ? "Generating..." : "Generate MBA"}
```

### `mediaLoadStatus`

**Declaration:**

```1260:1260:app/mediaplans/mba/[mba_number]/edit/page.tsx
type MediaLoadStatus = "idle" | "loading" | "ready" | "error"
```

```1767:1767:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const [mediaLoadStatus, setMediaLoadStatus] = useState<Partial<Record<MediaTypeKey, MediaLoadStatus>>>({})
```

**Setters:**

- Reset to `{}` at bootstrapping start (`2533`)
- Each enabled type set to `"loading"` before parallel fetch (`3247-3251`)
- Per-type `"ready"` on success (`3298`, `3181`)
- Per-type `"error"` on failure (`3306`, `3186`)
- Manual retry sets `"loading"` (`3177`)

**JSX driven:**

- `showSectionLoader` / `showSectionError` (`8658-8692`)
- Retry button disabled/label (`8682-8686`)

### `lineItemLoadItems`

**Declaration:**

```1766:1766:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const [lineItemLoadItems, setLineItemLoadItems] = useState<SaveStatusItem[]>([])
```

**Shape** (`SaveStatusItem` from `components/ui/saving-modal.tsx`):

```10:14:components/ui/saving-modal.tsx
export interface SaveStatusItem {
  name: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}
```

**Updated via** `updateLoadStatus` (`2015-2025`):

```2015:2024:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const updateLoadStatus = useCallback(
    (name: string, status: SaveStatusItem['status'], error?: string) => {
      setLineItemLoadItems((prev) => {
        const existing = prev.find((item) => item.name === name)
        if (!existing) {
          return [...prev, { name, status, error }]
        }
        return prev.map((item) =>
          item.name === name ? { ...item, status, error } : item
        )
```

**Initial item:** `[{ name: "Campaign details", status: "pending" }]` at bootstrapping (`2532`).

**Per-media items added** in parallel load loop (`3244-3245`, `3299`, `3307`).

**JSX driven:** `MediaPlanLoadStatusPill` (`9105-9121`); cleared in effect when all succeed (`2040-2042`).

### Unused `loading` state

**Declaration:**

```1768:1768:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const [loading, setLoading] = useState(true)
```

**Setters only** (`2522`, `2530`, `2735`, `2984`, `2996`) — **no reads in JSX or logic** (grep confirms only `setLoading` and comment matches). **Confirmed still present and unused for rendering.**

---

## 3. Current loading UI (what a skeleton would replace)

### Layer A — Route `loading.tsx`

Full-screen centered `Loader2` + “Loading campaign” / “Preparing your media plan editor…” (see Section 1).

### Layer B — `bootstrapping` branch

Partial page shell: hero + two-card grid. Full quoted JSX:

```8025:8066:app/mediaplans/mba/[mba_number]/edit/page.tsx
  if (loadPhase === "bootstrapping") {
    return (
      <div
        className="w-full min-h-screen"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10 pt-0 pb-24 space-y-6">
          <MediaPlanEditorHero
            className="mb-2"
            title="Edit Campaign"
            detail={
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Loading campaign details…</span>
              </div>
            }
          />
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-7 2xl:gap-8 xl:items-stretch">
            <div className="flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-2 min-h-[400px]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Campaign Details
                </h3>
              </div>
              <div className="flex flex-1 items-center justify-center px-6 pb-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span>Loading…</span>
                </div>
              </div>
            </div>
            <div className="flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm min-h-[400px]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Actions
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
```

Note: bootstrapping shows **“Quick Actions”** card (empty body). Loaded state replaces that column with **“Media Types”** toggles (see Section 4).

### Layer C — `loadingLineItems` branch

Main form **is fully rendered** (no early return). Only enabled media sections show spinners.

**Iteration:** `mediaTypes.map` filtered by `mediaFlagMap[medium.name]` (`8655-8656`).

**Per-section spinner** (`MediaContainerSuspenseFallback`):

```8669:8671:app/mediaplans/mba/[mba_number]/edit/page.tsx
                    {showSectionLoader && (
                      <MediaContainerSuspenseFallback label={medium.label} />
                    )}
```

Fallback component body:

```1198:1207:app/mediaplans/mba/[mba_number]/edit/page.tsx
function MediaContainerSuspenseFallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-8">
      <div className="relative h-5 w-5 shrink-0">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-t-primary" />
      </div>
      <span className="text-sm text-muted-foreground">Loading {label}…</span>
    </div>
  )
}
```

**Also used** as `Suspense` fallback when lazy containers load (`8694`).

**Error UI for failed section:**

```8672:8691:app/mediaplans/mba/[mba_number]/edit/page.tsx
                    {showSectionError && (
                      <div className="flex flex-col items-start gap-3 px-6 py-8">
                        <p className="text-sm text-destructive">
                          Failed to load {medium.label}. Other sections may still be available.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => retryMediaTypeLoad(medium.name, medium.label)}
                          disabled={mediaLoadStatus[medium.name as MediaTypeKey] === "loading"}
                        >
                          {mediaLoadStatus[medium.name as MediaTypeKey] === "loading"
                            ? `Retrying ${medium.label}...`
                            : `Retry ${medium.label}`}
                        </Button>
                        ...
                      </div>
                    )}
```

### `MediaPlanLoadStatusPill`

Full component (145 lines). Props:

```10:16:components/mediaplans/MediaPlanLoadStatusPill.tsx
interface MediaPlanLoadStatusPillProps {
  items: SaveStatusItem[]
  isLoading: boolean
  onDismiss?: () => void
  /** Optional: called when user clicks an errored section name. Receives the item name. */
  onItemClick?: (name: string) => void
}
```

Render summary:

- Fixed bottom-right pill (`fixed bottom-4 right-4 z-40`, width 320px)
- Returns `null` if `items.length === 0` or all success with `!isLoading`
- Header: `Loading sections (N/M)` while loading; error/success labels when done
- Header icon while loading: `<LoadingDots size="sm" dotClassName="bg-primary" />` (`61-62`)
- Expanded list: per-item `LoadingDots` for `pending`, check/X for success/error

**`LoadingDots` render:**

```20:44:components/ui/loading-dots.tsx
export function LoadingDots({
  size = "md",
  className,
  dotClassName,
  "aria-label": ariaLabel = "Loading",
}: LoadingDotsProps) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="status"
      aria-label={ariaLabel}
    >
      {[0, 1, 2].map((idx) => (
        <span
          key={idx}
          className={cn(
            "loading-dots__dot rounded-full bg-primary",
            dotSizeMap[size],
            dotClassName
          )}
          style={{ animationDelay: `${idx * 0.16}s` }}
        />
      ))}
    </div>
  )
}
```

### `MediaPlanLoadModal` — imported, not rendered

Import:

```70:70:app/mediaplans/mba/[mba_number]/edit/page.tsx
import { MediaPlanLoadModal } from "@/components/mediaplans/MediaPlanLoadModal"
```

**Confirmed:** no `<MediaPlanLoadModal` JSX in `page.tsx`. Component exists and wraps `SavingModal`:

```12:32:components/mediaplans/MediaPlanLoadModal.tsx
export function MediaPlanLoadModal({
  isOpen,
  items = [],
  isLoading = true,
  onClose,
}: MediaPlanLoadModalProps) {
  return (
    <SavingModal
      isOpen={isOpen}
      items={items}
      isSaving={isLoading}
      onClose={onClose}
      title="Loading campaign"
      ...
    />
  )
}
```

---

## 4. Loaded-content shape (what a skeleton must mirror)

### Hero / header

**Loaded hero** (`loadPhase` not bootstrapping/error — main return):

```8092:8108:app/mediaplans/mba/[mba_number]/edit/page.tsx
        <MediaPlanEditorHero
          className="mb-2"
          title="Edit Campaign"
          detail={
            <p>Update campaign settings, media types, and line item details.</p>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="text-xs"
              onClick={handleCopyPageContext}
            >
              Copy Context
            </Button>
          }
        />
```

`MediaPlanEditorHero` structure: rounded gradient banner, clipboard icon circle, `h1` title, optional detail, optional right-aligned actions (`components/mediaplans/MediaPlanEditorHero.tsx` lines 50-186).

### Top grid row (Campaign Details + Media Types)

**Layout:** `grid grid-cols-1 xl:grid-cols-3` — left `xl:col-span-2` Campaign Details, right column Media Types.

**Campaign Details card header** includes version meta + optional version combobox:

```8136:8156:app/mediaplans/mba/[mba_number]/edit/page.tsx
            <div className="flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Campaign Details</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>v{selectedVersionNumber ?? mediaPlan?.version_number ?? "—"}</span>
                ...
              </div>
            </div>
```

**Form fields in Campaign Details** (12 fields in responsive grid `md:grid-cols-2 xl:grid-cols-3`):

1. Client Name (disabled input)
2. Campaign Name
3. Brand
4. Campaign Status (combobox)
5. Client Contact
6. PO Number
7. Campaign Start Date (date picker)
8. Campaign End Date (date picker)
9. Campaign Budget
10. MBA Identifier (read-only div)
11. MBA Number (read-only div)
12. Media Plan Version (read-only div)

Example field:

```8159:8173:app/mediaplans/mba/[mba_number]/edit/page.tsx
              <FormField
                control={form.control}
                name="mp_clientname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Client Name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    ...
                  </FormItem>
                )}
              />
```

**Media Types column:** 20 switches (one per entry in `mediaTypes` array), 2-column grid on md+:

```8398:8434:app/mediaplans/mba/[mba_number]/edit/page.tsx
          <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-1">
            <div className="border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Media Types</h3>
            </div>
            <div className="grid min-h-0 w-full flex-1 grid-cols-1 content-start gap-x-3 gap-y-1.5 px-6 py-4 md:grid-cols-2">
              {mediaTypes.map(({ name, label }) => {
                ...
                    <Switch ... />
                    <Label ...>{label}</Label>
```

### Second row: MBA Details, Billing, KPIs

Three-column grid (`8439+`): MBA Details (totals list), Billing schedule table (6 columns: Month, Media, Fee, Ad Serving, Production, Total — `8574-8581`), KPIs section.

### Line-items area (“Media Containers”)

**Section header:**

```8646:8652:app/mediaplans/mba/[mba_number]/edit/page.tsx
          <div className="space-y-6">
            <div className="relative pb-2 pt-8">
              <div className="absolute inset-x-0 top-4 h-px bg-border/50" />
              <h3 className="relative inline-block bg-background pr-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Media Containers
              </h3>
            </div>
```

**One block per enabled media type** (not all 20 — only those with form flag true):

```8655:8656:app/mediaplans/mba/[mba_number]/edit/page.tsx
              {mediaTypes.map((medium) => {
                if (!mediaFlagMap[medium.name as MediaTypeKey]) return null;
```

Each enabled type renders a lazy container (e.g. `SearchContainer`, `TelevisionContainer`) inside `Suspense`.

**Representative container layout (Search — card list, not a single data table):**

Outer summary card + per-line-item cards:

```1166:1176:components/media-containers/SearchContainer.tsx
    <div className="space-y-6">
      <div className="mb-6">
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
          <CardHeader className="pb-3">
            ...
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Search Media
                  </CardTitle>
```

Per line item (card with header + 4-column summary row):

```1353:1417:components/media-containers/SearchContainer.tsx
                    <Card key={field.id} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6">
                      <CardHeader className="pb-2 bg-muted/30">
                        ...
                              <CardTitle className="text-sm font-semibold tracking-tight">Search Line Item</CardTitle>
                        ...
                      </CardHeader>
                      
                      {/* Summary Row - Always visible */}
                      <div className="px-6 py-2 border-b">
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Platform:</span> ...
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> ...
                          </div>
                          <div>
                            <span className="font-medium">Bid strategy:</span> ...
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> ...
                          </div>
                        </div>
                      </div>
```

Summary totals row in header card uses 4 numeric columns (Deliverables, Media, Fee, Total) — `1260-1284`.

**Pattern:** Card-based entry per media type; structure varies by container but generally **section card → N line-item cards → burst/field grids inside**. TelevisionContainer follows the same card-per-line-item pattern (`TelevisionContainer.tsx` ~1537+).

### Sticky bottom action bar

Fixed bottom pill with Save, Generate MBA, download actions (`10102-10269`). Not shown during bootstrapping early return.

### Floating section nav

```10274:10274:app/mediaplans/mba/[mba_number]/edit/page.tsx
      <FloatingSectionNav sections={enabledSections} storageKey="mediaplan-edit-section-nav-collapsed" />
```

`enabledSections` derived from enabled media flags:

```2287:2294:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const enabledSections = useMemo(() => {
    return mediaTypes
      .filter((medium) => mediaFlagMap[medium.name])
      .map((medium) => ({
        id: `media-section-${medium.name}`,
        label: medium.label,
      }))
  }, [mediaFlagMap])
```

### How media-type / row counts are determined at runtime

**Media types shown (section count):**

From form boolean flags via `mediaFlagMap`, populated from API on form reset:

```2234:2256:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const mediaFlagMap = useMemo(
    (): Record<MediaTypeKey, boolean> => ({
      mp_production: !!mpProduction,
      mp_television: !!mpTelevision,
      ...
      mp_influencers: !!mpInfluencers,
    }),
```

Flags set from API response in `formData` (`2927-2950`) then `form.reset(formData)` (`2957`).

**Parallel load uses same filter:**

```3227:3233:app/mediaplans/mba/[mba_number]/edit/page.tsx
      const enabledInOrder = mediaTypes
        .filter((medium) => formValues[medium.name])
        .map((medium) => ({
          flag: medium.name,
          label: medium.label,
          ...lineItemLoaderConfig[medium.name],
        }))
```

**Total line-item row count (all types):**

```1851:1873:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const editLineItemCount = useMemo(() => {
    return (
      televisionLineItems.length +
      radioLineItems.length +
      ...
      influencersLineItems.length
    )
  }, [
```

Per-type counts come from API fetch into `*LineItems` state arrays (e.g. `setSearchLineItems(processedItems)` at `3288`). **Row counts are not known until each media type fetch completes** — only which sections exist is known after metadata load (`loadingLineItems` start).

**Fixed catalog size:** 20 media type keys in `MEDIA_TYPE_KEYS` / `mediaTypes` array (`1070-1090`, `1233-1258`).

---

## 5. Existing skeleton conventions to match

### `components/ui/skeleton.tsx`

Exists. Full file:

```1:15:components/ui/skeleton.tsx
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
```

### `app/pacing/loading.tsx` reference

```1:36:app/pacing/loading.tsx
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-3xl border border-muted/70 bg-background/90 shadow-sm">
        <CardHeader className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 w-full rounded-3xl" />
        ...
      </div>

      <Card className="rounded-3xl border border-muted/70 bg-background/90 shadow-sm">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
```

Conventions: `Skeleton` with explicit heights/widths; `rounded-3xl` cards with `border-muted/70`; grid placeholders for form rows and stat cards; stacked `h-14` rows for list-like content.

---

## Gaps and unconfirmed

| Item | Status |
|------|--------|
| Exact field/column layout inside every media container (20 types) | **UNCONFIRMED** per-type — only SearchContainer quoted in detail; others follow similar card-per-line-item pattern per TelevisionContainer grep |
| Whether bootstrapping “Quick Actions” card should map to “Media Types” in skeleton | **UNCONFIRMED** intent — loaded UI uses Media Types, not Quick Actions |
| `FloatingSectionNav` internal markup | **NOT FOUND** in this discovery (import only; file not read) |
| Per-container line-item placeholder count before fetch | **Not derivable upfront** — only section count derivable from `mediaFlagMap` after metadata load |
| `loadPhase === "ready"` explicit render branch | **NOT FOUND** — `ready` is implicit (main return without early exits) |
