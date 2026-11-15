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
/** A value longer than this many times its cap is dropped, not shortened. */
const HOSTILE_FACTOR = 4

/** An MBA number as the app stores them (BICAU002, sinch001, ASM-2026.01). */
const MBA_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
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

function shorten(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
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
  const qs = new URLSearchParams()
  qs.set("compose", input.compose)
  const title = oneLine((input.title ?? "").replace(CONTROL_RE, ""))
  if (title) qs.set("pf_title", shorten(title, COMPOSE_TITLE_MAX))
  const description = multiLine((input.description ?? "").replace(CONTROL_RE, ""))
  if (description) qs.set("pf_desc", shorten(description, COMPOSE_DESCRIPTION_MAX))
  if (typeof input.clientId === "number" && Number.isInteger(input.clientId) && input.clientId > 0) {
    qs.set("pf_client", String(input.clientId))
  }
  const mba = (input.mbaNumber ?? "").trim()
  if (mba && mba.length <= COMPOSE_MBA_MAX && MBA_RE.test(mba)) qs.set("pf_mba", mba)
  if (input.category && isTaskCategory(input.category)) qs.set("pf_category", input.category)
  return `/tasks?${qs.toString()}`
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
