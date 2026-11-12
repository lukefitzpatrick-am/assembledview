/**
 * Codex saved views (F8, switch `codex_saved_views`, table codex_saved_views
 * from migration 0117). Pure: shared by the API, the repo and the page.
 *
 * A view stores the /tasks filters as the same query string the page writes
 * (serializeTasksFilterParams), as an object, minus `view` and `task`. The
 * layout (list or board) goes in its own column. `?view=<id>` on /tasks opens
 * a view; `view=list` and `view=board` stay the layout, as before.
 */
import {
  parseTasksFilterParams,
  serializeTasksFilterParams,
  type TaskSortKey,
  type TasksFilterState,
  type TasksFilterView,
} from "@/lib/codex/queryHelpers"

export const SAVED_VIEW_SCREENS = ["tasks"] as const
export type SavedViewScreen = (typeof SAVED_VIEW_SCREENS)[number]

/** Plan section 3.2. Only Plan exists today; Flow arrives with the capture track. */
export const SAVED_VIEW_LENSES = ["plan", "flow"] as const
export type SavedViewLens = (typeof SAVED_VIEW_LENSES)[number]

export const SAVED_VIEW_LAYOUTS = ["list", "board"] as const satisfies readonly TasksFilterView[]

/** The board groups by status; no other grouping exists yet. */
export const SAVED_VIEW_GROUP_BYS = ["status"] as const

export const SAVED_VIEW_NAME_MAX = 80
export const SAVED_VIEW_FILTER_VALUE_MAX = 200

/** Every /tasks filter param serializeTasksFilterParams can write, except `view`. */
export const SAVED_VIEW_FILTER_KEYS = [
  "mba",
  "client",
  "q",
  "assignee",
  "category",
  "status",
  "week",
  "all",
  "sort",
  "priority",
  "overdue",
  "unassigned",
  "no_client",
  "created_by",
  "due_from",
  "due_to",
  "source",
] as const

const FILTER_KEY_SET = new Set<string>(SAVED_VIEW_FILTER_KEYS)

export type SavedViewFilters = Record<string, string>

export type CodexSavedView = {
  id: number
  owner_email: string
  name: string
  screen: SavedViewScreen
  lens: SavedViewLens
  filters: SavedViewFilters
  layout: TasksFilterView | null
  group_by: string | null
  shared: boolean
  created_at: string
  /** True when the signed-in person owns it (may rename and delete). */
  mine: boolean
}

export type SavedViewInput = {
  name: string
  screen: SavedViewScreen
  lens: SavedViewLens
  filters: SavedViewFilters
  layout: TasksFilterView | null
  group_by: string | null
  shared: boolean
}

export type SavedViewPatch = { name?: string; shared?: boolean }

type Result<T> = { ok: true; value: T } | { ok: false; error: string; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/** Known keys with non-empty string values up to 200 characters; anything else is dropped. */
export function sanitiseSavedViewFilters(raw: unknown): SavedViewFilters {
  const out: SavedViewFilters = {}
  if (!isRecord(raw)) return out
  for (const key of SAVED_VIEW_FILTER_KEYS) {
    const value = raw[key]
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > SAVED_VIEW_FILTER_VALUE_MAX) continue
    out[key] = trimmed
  }
  return out
}

function getter(filters: SavedViewFilters) {
  return { get: (name: string) => (FILTER_KEY_SET.has(name) ? filters[name] ?? null : null) }
}

/**
 * The filters as the page would write them: parse then serialize, so a view
 * and the live toolbar compare equal when they show the same thing.
 */
export function canonicalSavedViewFilters(filters: SavedViewFilters): SavedViewFilters {
  const parsed = parseTasksFilterParams(getter(sanitiseSavedViewFilters(filters)))
  return filtersFromQueryString(serializeTasksFilterParams({ ...parsed, view: null }))
}

/** The saveable filters in a /tasks query string (drops `view`, `task` and unknown keys). */
export function filtersFromQueryString(qs: string | { toString(): string }): SavedViewFilters {
  const params = new URLSearchParams(typeof qs === "string" ? qs : qs.toString())
  const raw: Record<string, string> = {}
  for (const [key, value] of params) {
    if (FILTER_KEY_SET.has(key)) raw[key] = value
  }
  return sanitiseSavedViewFilters(raw)
}

function sortedEntries(filters: SavedViewFilters): string {
  return JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)))
}

/** Same filters (canonical) and, when the view has one, the same layout. */
export function savedViewMatches(
  view: Pick<CodexSavedView, "filters" | "layout">,
  current: { filters: SavedViewFilters; layout: TasksFilterView }
): boolean {
  if (view.layout && view.layout !== current.layout) return false
  return sortedEntries(canonicalSavedViewFilters(view.filters)) === sortedEntries(canonicalSavedViewFilters(current.filters))
}

/** `?view=<id>`: a positive whole number. `list`, `board` and anything else are not a saved view. */
export function parseSavedViewParam(raw: string | null | undefined): number | null {
  const value = raw?.trim() ?? ""
  if (!/^[1-9]\d{0,15}$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

/** /tasks link that opens a view: its filters plus `view=<id>`. */
export function savedViewHref(view: Pick<CodexSavedView, "id" | "filters">): string {
  const params = new URLSearchParams(canonicalSavedViewFilters(view.filters))
  params.set("view", String(view.id))
  return `/tasks?${params.toString()}`
}

/**
 * The page's query string with the active view: `view=<id>` takes the place
 * of the layout param (the view carries its layout). No active view: as is.
 */
export function withSavedViewParam(qs: string, activeViewId: number | null): string {
  if (activeViewId == null) return qs
  const params = new URLSearchParams(qs)
  params.delete("view")
  params.set("view", String(activeViewId))
  return params.toString()
}

function normaliseName(raw: unknown): Result<string> {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : ""
  if (!name) return { ok: false, error: "invalid_name", message: "Give the view a name" }
  if (name.length > SAVED_VIEW_NAME_MAX) {
    return { ok: false, error: "invalid_name", message: `Keep the name to ${SAVED_VIEW_NAME_MAX} characters` }
  }
  return { ok: true, value: name }
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T | null): T | null | undefined {
  if (raw == null || raw === "") return fallback
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined
}

/** POST body. Screen defaults to tasks, lens to plan, shared to false. */
export function parseSavedViewInput(body: unknown): Result<SavedViewInput> {
  if (!isRecord(body)) return { ok: false, error: "invalid_body", message: "Send a JSON object" }
  const name = normaliseName(body.name)
  if (!name.ok) return name
  const screen = oneOf(body.screen, SAVED_VIEW_SCREENS, "tasks")
  if (!screen) return { ok: false, error: "invalid_screen", message: "Unknown screen" }
  const lens = oneOf(body.lens, SAVED_VIEW_LENSES, "plan")
  if (!lens) return { ok: false, error: "invalid_lens", message: "Unknown lens" }
  const layout = oneOf(body.layout, SAVED_VIEW_LAYOUTS, null)
  if (layout === undefined) return { ok: false, error: "invalid_layout", message: "Layout is list or board" }
  const groupBy = oneOf(body.group_by, SAVED_VIEW_GROUP_BYS, null)
  if (groupBy === undefined) return { ok: false, error: "invalid_group_by", message: "Unknown grouping" }
  if (body.filters != null && !isRecord(body.filters)) {
    return { ok: false, error: "invalid_filters", message: "Filters must be an object" }
  }
  if (body.shared != null && typeof body.shared !== "boolean") {
    return { ok: false, error: "invalid_shared", message: "Shared is true or false" }
  }
  return {
    ok: true,
    value: {
      name: name.value,
      screen,
      lens,
      filters: canonicalSavedViewFilters(sanitiseSavedViewFilters(body.filters)),
      layout,
      group_by: groupBy,
      shared: body.shared === true,
    },
  }
}

/** PATCH body: a new name, shared on or off, or both. */
export function parseSavedViewPatch(body: unknown): Result<SavedViewPatch> {
  if (!isRecord(body)) return { ok: false, error: "invalid_body", message: "Send a JSON object" }
  const patch: SavedViewPatch = {}
  if (body.name !== undefined) {
    const name = normaliseName(body.name)
    if (!name.ok) return name
    patch.name = name.value
  }
  if (body.shared !== undefined) {
    if (typeof body.shared !== "boolean") {
      return { ok: false, error: "invalid_shared", message: "Shared is true or false" }
    }
    patch.shared = body.shared
  }
  if (patch.name === undefined && patch.shared === undefined) {
    return { ok: false, error: "nothing_to_change", message: "Send a name or shared" }
  }
  return { ok: true, value: patch }
}

/**
 * The toolbar state a view shows: filters (as commitFilters takes them),
 * sort, and the layout when the view has one. My week keeps My tasks on, as
 * the page does when it opens with `week=1`.
 */
export function savedViewToolbarState(view: Pick<CodexSavedView, "filters" | "layout">): {
  filters: TasksFilterState
  sort: TaskSortKey
  layout: TasksFilterView | null
} {
  const parsed = parseTasksFilterParams(getter(sanitiseSavedViewFilters(view.filters)))
  return {
    filters: {
      clientId: parsed.clientId ?? "",
      mbaNumber: parsed.mbaNumber ?? "",
      search: parsed.search ?? "",
      assigneeEmail: parsed.assigneeEmail ?? "",
      category: parsed.category ?? "",
      statuses: parsed.statuses ?? [],
      mine: parsed.myWeek ? true : parsed.mine,
      myWeek: parsed.myWeek,
      priorities: parsed.priorities,
      overdue: parsed.overdue,
      unassigned: parsed.unassigned,
      noClient: parsed.noClient,
      createdByEmail: parsed.createdByEmail ?? "",
      dueFrom: parsed.dueFrom ?? "",
      dueTo: parsed.dueTo ?? "",
      sources: parsed.sources,
    },
    sort: parsed.sort,
    layout: view.layout,
  }
}
