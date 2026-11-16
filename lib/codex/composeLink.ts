/**
 * Codex containment (C-200, B44, switch `codex_contained_writes`): links from
 * pages outside /tasks that open /tasks with a new task or Ask for help filled
 * in, and the /tasks side that reads them.
 *
 * Pure and client-safe. The link carries only a whitelist of params; /tasks
 * reads nothing else from it, caps every value, refuses HTML, and never saves
 * on load: the person still presses Save or Send.
 *
 * Params: `compose` (task | help), `pf_title`, `pf_desc`, `pf_client`
 * (client id), `pf_mba`, `pf_category`.
 */
import { TASK_CATEGORIES, TASK_TITLE_MAX, isTaskCategory, type TaskCategory } from "@/lib/codex/types"

export type TasksComposeKind = "task" | "help"

export const TASKS_COMPOSE_PARAMS = ["compose", "pf_title", "pf_desc", "pf_client", "pf_mba", "pf_category"] as const

export const COMPOSE_TITLE_MAX = TASK_TITLE_MAX
export const COMPOSE_DESCRIPTION_MAX = 2000
export const COMPOSE_MBA_MAX = 40
/**
 * The whole link, `/tasks?...` encoded, stays at or under this many characters
 * (B44fix R5). An expired session sends the link through the login redirect as
 * `returnTo`, which Auth0 keeps in a cookie; this keeps that well under 4 KB.
 */
export const COMPOSE_HREF_MAX = 1800
/** The closing line of a description shortened to fit the link, unless the caller names its own. */
export const COMPOSE_LIST_SHORTENED = "List shortened: open the page this came from for the full list."
/** A value longer than this many times its cap is dropped, not shortened. */
const HOSTILE_FACTOR = 4

/**
 * An MBA number as the app stores them (BICAU002, sinch001, ASM-2026.01). Spaces
 * are allowed inside: one live master is "Historical OX and Harty Clients001"
 * (SELECT, 16 Nov 2026: 1 of 228 masters has a space, none another character).
 */
const MBA_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/
const CLIENT_RE = /^[1-9][0-9]{0,11}$/
/** A tag, a closing tag, a comment or a stray angle bracket: HTML is never prefilled. */
const HTML_RE = /[<>]/
/** Control characters other than tab and newline. */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g

export type TasksComposeInput = {
  compose: TasksComposeKind
  title?: string | null
  description?: string | null
  clientId?: number | null
  mbaNumber?: string | null
  category?: TaskCategory | null
  /** The closing line when the description is shortened to fit the link (default `COMPOSE_LIST_SHORTENED`). */
  shortenedNote?: string
}

export type TasksComposePrefill = {
  title?: string
  description?: string
  clientId?: number
  mbaNumber?: string
  category?: TaskCategory
}

export type ParsedTasksCompose = {
  compose: TasksComposeKind | null
  prefill: TasksComposePrefill
  /** Plain sentences for a quiet note: what was left out of the link and why. */
  notes: string[]
}

/** `value.slice(0, end)` without splitting a surrogate pair. */
function sliceSafe(value: string, end: number): string {
  if (end > 0 && end < value.length) {
    const code = value.charCodeAt(end - 1)
    if (code >= 0xd800 && code <= 0xdbff) return value.slice(0, end - 1)
  }
  return value.slice(0, end)
}

function shorten(value: string, max: number): string {
  if (value.length <= max) return value
  return `${sliceSafe(value, max - 1).trimEnd()}…`
}

/** The largest n in [0, hi] with fits(n) true (fits is monotonic, fits(0) true). */
function largestFitting(hi: number, fits: (n: number) => boolean): number {
  let lo = 0
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(mid)) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * The first `n` characters of a description, cut back to whole lines (or
 * shortened with an ellipsis when the first line alone is longer), then a
 * blank line and the closing note.
 */
function descriptionPrefix(description: string, n: number, note: string): string {
  let head = sliceSafe(description, n)
  const lastBreak = head.lastIndexOf("\n")
  if (lastBreak >= 0) head = head.slice(0, lastBreak)
  else if (head) head = `${sliceSafe(head, Math.max(0, head.length - 1)).trimEnd()}…`
  head = head.trimEnd()
  return head ? `${head}\n\n${note}` : note
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function multiLine(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * The /tasks link that opens a new task (`compose: "task"`) or Ask for help
 * (`"help"`) with these details filled in. Values are trimmed to the caps the
 * parser applies, so a link built here always reads back whole.
 */
export function buildTasksComposeHref(input: TasksComposeInput): string {
  const title = oneLine((input.title ?? "").replace(CONTROL_RE, ""))
  const description = multiLine((input.description ?? "").replace(CONTROL_RE, ""))
  const clientId =
    typeof input.clientId === "number" && Number.isInteger(input.clientId) && input.clientId > 0 ? input.clientId : null
  const mbaRaw = (input.mbaNumber ?? "").trim()
  const mba = mbaRaw && mbaRaw.length <= COMPOSE_MBA_MAX && MBA_RE.test(mbaRaw) ? mbaRaw : ""
  const category = input.category && isTaskCategory(input.category) ? input.category : null
  const note = oneLine((input.shortenedNote ?? COMPOSE_LIST_SHORTENED).replace(CONTROL_RE, "")) || COMPOSE_LIST_SHORTENED

  const href = (t: string, d: string): string => {
    const qs = new URLSearchParams()
    qs.set("compose", input.compose)
    if (t) qs.set("pf_title", t)
    if (d) qs.set("pf_desc", d)
    if (clientId != null) qs.set("pf_client", String(clientId))
    if (mba) qs.set("pf_mba", mba)
    if (category) qs.set("pf_category", category)
    return `/tasks?${qs.toString()}`
  }

  let t = shorten(title, COMPOSE_TITLE_MAX)
  const full = shorten(description, COMPOSE_DESCRIPTION_MAX)
  const whole = href(t, full)
  if (whole.length <= COMPOSE_HREF_MAX) return whole

  // B44fix R5: keep the whole link under the cap. The description goes first,
  // to whole lines with a closing "List shortened" line; the title only if
  // that is still not enough (a long non-ASCII title).
  let d = full
  if (description) {
    const fits = (n: number) => href(t, descriptionPrefix(full, n, note)).length <= COMPOSE_HREF_MAX
    d = fits(0) ? descriptionPrefix(full, largestFitting(full.length, fits), note) : note
  }
  if (href(t, d).length > COMPOSE_HREF_MAX) {
    const fits = (n: number) => href(n > 0 ? shorten(t, n) : "", d).length <= COMPOSE_HREF_MAX
    const n = largestFitting(t.length, fits)
    t = n > 0 ? shorten(t, n) : ""
  }
  return href(t, d)
}

/** `/tasks?mba=<mba>`: the Tasks list scoped to one campaign (the existing deep link). */
export function tasksForMbaHref(mbaNumber: string): string {
  const mba = mbaNumber.trim()
  if (!mba) return "/tasks"
  return `/tasks?${new URLSearchParams({ mba }).toString()}`
}

type ParamSource = { get(name: string): string | null; getAll(name: string): string[] }

const LABELS: Record<string, string> = {
  pf_title: "title",
  pf_desc: "description",
  pf_client: "client",
  pf_mba: "MBA",
  pf_category: "category",
}

function readOne(params: ParamSource, key: string, notes: string[]): string | null {
  const all = params.getAll(key)
  if (all.length === 0) return null
  if (all.length > 1) notes.push(`The link had more than one ${LABELS[key] ?? key}; only the first was used.`)
  return all[0] ?? null
}

/** A text value: control characters removed, HTML refused, length capped (hostile lengths refused). */
function readText(
  params: ParamSource,
  key: "pf_title" | "pf_desc",
  max: number,
  notes: string[],
): string | undefined {
  const raw = readOne(params, key, notes)
  if (raw == null) return undefined
  const label = LABELS[key]
  if (raw.length > max * HOSTILE_FACTOR) {
    notes.push(`The ${label} in the link was too long and was left out.`)
    return undefined
  }
  if (HTML_RE.test(raw)) {
    notes.push(`The ${label} in the link had HTML in it and was left out.`)
    return undefined
  }
  const clean = raw.replace(CONTROL_RE, "")
  const value = key === "pf_title" ? oneLine(clean) : multiLine(clean)
  if (!value) return undefined
  if (value.length > max) {
    notes.push(`The ${label} in the link was shortened to ${max} characters.`)
    return shorten(value, max)
  }
  return value
}

/**
 * Reads the compose link on /tasks. Only the whitelisted params are read; any
 * other param is left to the page as before. `compose` is null when the link
 * asks for nothing (or for something other than task or help), and then the
 * page opens nothing.
 */
export function parseTasksComposeParams(params: ParamSource): ParsedTasksCompose {
  const notes: string[] = []
  const composeRaw = params.get("compose")
  const compose: TasksComposeKind | null = composeRaw === "task" || composeRaw === "help" ? composeRaw : null
  if (!compose) return { compose: null, prefill: {}, notes: [] }

  const prefill: TasksComposePrefill = {}
  const title = readText(params, "pf_title", COMPOSE_TITLE_MAX, notes)
  if (title) prefill.title = title
  const description = readText(params, "pf_desc", COMPOSE_DESCRIPTION_MAX, notes)
  if (description) prefill.description = description

  const client = readOne(params, "pf_client", notes)
  if (client != null) {
    const trimmed = client.trim()
    if (CLIENT_RE.test(trimmed)) prefill.clientId = Number(trimmed)
    else notes.push("The client in the link is not a client id and was left out.")
  }

  const mba = readOne(params, "pf_mba", notes)
  if (mba != null) {
    const trimmed = mba.trim()
    if (trimmed.length <= COMPOSE_MBA_MAX && MBA_RE.test(trimmed)) prefill.mbaNumber = trimmed
    else notes.push("The MBA in the link is not an MBA number and was left out.")
  }

  const category = readOne(params, "pf_category", notes)
  if (category != null) {
    if (isTaskCategory(category)) prefill.category = category
    else notes.push(`The category in the link is not one of ${TASK_CATEGORIES.join(", ")} and was left out.`)
  }

  return { compose, prefill, notes }
}

export type ComposeLookups = {
  /** Client ids the person can pick on /tasks (`/api/clients`), or null when they could not be read. */
  clientIds: ReadonlySet<number> | null
  /**
   * MBA numbers of the prefilled client (`GET /api/codex/client-mbas`), or
   * null when they could not be read.
   */
  mbasForClient: ReadonlySet<string> | null
}

/**
 * Checks the prefill against what /tasks knows: an unknown client is left
 * out (and its MBA with it, since an MBA is checked against its client); an
 * MBA that is not one of the client's campaigns is left out. Each leaves a
 * note. Nothing is looked up or written here.
 */
export function resolveComposePrefill(
  parsed: ParsedTasksCompose,
  lookups: ComposeLookups,
): ParsedTasksCompose {
  const notes = [...parsed.notes]
  const prefill: TasksComposePrefill = { ...parsed.prefill }
  if (prefill.clientId != null) {
    if (lookups.clientIds == null) {
      notes.push(`Client ${prefill.clientId} from the link could not be checked, so it was left out.`)
      delete prefill.clientId
    } else if (!lookups.clientIds.has(prefill.clientId)) {
      notes.push(`Client ${prefill.clientId} from the link was not found, so it was left out.`)
      delete prefill.clientId
    }
  }
  if (prefill.mbaNumber != null) {
    const mba = prefill.mbaNumber
    if (prefill.clientId == null) {
      notes.push(`MBA ${mba} from the link was left out: it needs a client to check it against.`)
      delete prefill.mbaNumber
    } else if (lookups.mbasForClient == null) {
      notes.push(`MBA ${mba} from the link could not be checked, so it was left out.`)
      delete prefill.mbaNumber
    } else {
      const known = knownMba(lookups.mbasForClient, mba)
      if (known) prefill.mbaNumber = known
      else {
        notes.push(`MBA ${mba} from the link is not one of this client's campaigns, so it was left out.`)
        delete prefill.mbaNumber
      }
    }
  }
  return { compose: parsed.compose, prefill, notes }
}

/** The client's own spelling of the MBA (case-insensitive match), or null. */
function knownMba(mbas: ReadonlySet<string>, mba: string): string | null {
  if (mbas.has(mba)) return mba
  const lower = mba.toLowerCase()
  for (const m of mbas) if (m.toLowerCase() === lower) return m
  return null
}

/** The /tasks query string without the compose params (after the dialog has opened). */
export function withoutComposeParams(search: string): string {
  const qs = new URLSearchParams(search)
  for (const key of TASKS_COMPOSE_PARAMS) qs.delete(key)
  return qs.toString()
}
