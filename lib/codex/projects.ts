/**
 * Codex projects and sections (S1, B38): pure rules. No database, no
 * server-only, so the board (B39) can import the same rules.
 *
 * Plan section 5.2:
 * - Codex `status` stays the fixed set (backlog, todo, in_progress, waiting,
 *   done). Each section carries a status category (todo, in_progress,
 *   waiting, done), suggested from its name and editable.
 * - Moving a task into a section sets its status to that category.
 * - A project keeps at least one done section; moving a task there completes it.
 * - Completing a task moves it to the project's first done section.
 *
 * Plan section 13: a private project is visible to its owner, its creator and
 * its members only. Anything that changes who can see a project (private,
 * owner, members) is for the owner or the creator.
 */
import type {
  CodexProjectKind,
  CodexProjectStatus,
  CodexSectionStatusCategory,
} from "@/db/schema/codex"
import { TASK_TITLE_MAX, type TaskStatus } from "@/lib/codex/types"

export const PROJECT_KINDS = ["campaign", "retainer", "onboarding", "pitch", "internal", "ops"] as const satisfies readonly CodexProjectKind[]
export const PROJECT_STATUSES = ["active", "on_hold", "closed"] as const satisfies readonly CodexProjectStatus[]
export const SECTION_STATUS_CATEGORIES = ["todo", "in_progress", "waiting", "done"] as const satisfies readonly CodexSectionStatusCategory[]

export type ProjectKind = (typeof PROJECT_KINDS)[number]
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export type SectionStatusCategory = (typeof SECTION_STATUS_CATEGORIES)[number]

export const PROJECT_NAME_MAX = 200
export const SECTION_NAME_MAX = 120
export const MBA_NUMBER_MAX = 64
export const SECTIONS_PER_PROJECT_MAX = 50
export const MEMBERS_PER_PROJECT_MAX = 100
/** Postgres integer range, for tasks.sort_order and codex_sections.sort_order. */
const INT4_MAX = 2147483647

export type CodexProject = {
  id: number
  kind: ProjectKind
  client_id: number | null
  mba_number: string | null
  name: string
  owner_email: string | null
  is_private: boolean
  status: ProjectStatus
  start_on: string | null
  due_on: string | null
  created_by_email: string
  created_at: string
  updated_at: string
  members: string[]
}

export type CodexSection = {
  id: number
  project_id: number
  name: string
  sort_order: number
  collapsed_default: boolean
  status_category: SectionStatusCategory
}

export type SectionDraft = { name: string; status_category: SectionStatusCategory }

/** The parts of a project the visibility rules read. */
export type ProjectAccessFacts = {
  is_private: boolean
  owner_email: string | null
  created_by_email: string | null
  members: readonly string[]
}

export function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

export function isProjectKind(value: unknown): value is ProjectKind {
  return typeof value === "string" && (PROJECT_KINDS as readonly string[]).includes(value)
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value)
}

export function isSectionStatusCategory(value: unknown): value is SectionStatusCategory {
  return typeof value === "string" && (SECTION_STATUS_CATEGORIES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/** Owner or creator: the people who decide who can see the project. */
export function isProjectOwner(project: ProjectAccessFacts, viewerEmail: string): boolean {
  const viewer = normaliseEmail(viewerEmail)
  if (!viewer) return false
  return normaliseEmail(project.owner_email) === viewer || normaliseEmail(project.created_by_email) === viewer
}

/** Public projects: every staff member. Private: owner, creator and members only. */
export function canSeeProject(project: ProjectAccessFacts, viewerEmail: string): boolean {
  if (!project.is_private) return true
  const viewer = normaliseEmail(viewerEmail)
  if (!viewer) return false
  if (isProjectOwner(project, viewer)) return true
  return project.members.some((m) => normaliseEmail(m) === viewer)
}

// ---------------------------------------------------------------------------
// Sections and status
// ---------------------------------------------------------------------------

const CATEGORY_PHRASES: ReadonlyArray<readonly [SectionStatusCategory, readonly string[]]> = [
  ["done", ["done", "finished"]],
  ["waiting", ["awaiting", "support needed"]],
  ["in_progress", ["in progress", "today", "this week"]],
]

function normaliseSectionName(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `
}

/**
 * Plan 5.2 name defaults: Done, Finished to done; Awaiting, Support needed to
 * waiting; In Progress, Today, This Week to in progress; else to do. Whole
 * words, any case, punctuation ignored ("Awaiting client" is waiting).
 * Earlier categories win. Only a suggestion: people can change it.
 */
export function suggestSectionCategory(name: string): SectionStatusCategory {
  const norm = normaliseSectionName(name)
  for (const [category, phrases] of CATEGORY_PHRASES) {
    if (phrases.some((phrase) => norm.includes(` ${phrase} `))) return category
  }
  return "todo"
}

/** The task status a section's category sets. */
export function statusForSectionCategory(category: SectionStatusCategory): TaskStatus {
  switch (category) {
    case "todo":
      return "todo"
    case "in_progress":
      return "in_progress"
    case "waiting":
      return "waiting"
    case "done":
      return "done"
  }
}

export function sortSections<T extends Pick<CodexSection, "id" | "sort_order">>(sections: readonly T[]): T[] {
  return [...sections].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}

/** The first done section in board order, or null. */
export function firstDoneSection<T extends Pick<CodexSection, "id" | "sort_order" | "status_category">>(
  sections: readonly T[]
): T | null {
  return sortSections(sections).find((s) => s.status_category === "done") ?? null
}

export const DEFAULT_SECTION_DRAFTS: readonly SectionDraft[] = [
  { name: "To do", status_category: "todo" },
  { name: "In progress", status_category: "in_progress" },
  { name: "Done", status_category: "done" },
]

/**
 * Sections for a new project: the given ones in order (default To do, In
 * progress, Done when none), with "Done" appended when none is done, so a
 * project always starts with a done section.
 */
export function initialSectionDrafts(drafts: readonly SectionDraft[] | undefined): SectionDraft[] {
  const list = drafts && drafts.length > 0 ? [...drafts] : [...DEFAULT_SECTION_DRAFTS]
  if (!list.some((d) => d.status_category === "done")) list.push({ name: "Done", status_category: "done" })
  return list
}

export type SectionRuleFailure =
  | { ok: false; reason: "last_done_section"; message: string }
  | { ok: false; reason: "section_not_empty"; message: string }

const LAST_DONE: SectionRuleFailure = {
  ok: false,
  reason: "last_done_section",
  message: "A project needs at least one done section. Add another done section first.",
}

/** Changing a section's category must leave the project with a done section. */
export function checkRecategorise(
  sections: readonly Pick<CodexSection, "id" | "status_category">[],
  sectionId: number,
  next: SectionStatusCategory
): { ok: true } | SectionRuleFailure {
  if (next === "done") return { ok: true }
  const doneLeft = sections.filter((s) => s.status_category === "done" && s.id !== sectionId).length
  return doneLeft > 0 ? { ok: true } : LAST_DONE
}

/** A section is deleted only when no live task is in it, and never the last done one. */
export function checkDeleteSection(
  sections: readonly Pick<CodexSection, "id" | "status_category">[],
  sectionId: number,
  liveTaskCount: number
): { ok: true } | SectionRuleFailure {
  if (liveTaskCount > 0) {
    return {
      ok: false,
      reason: "section_not_empty",
      message: `Move the ${liveTaskCount} task${liveTaskCount === 1 ? "" : "s"} out of this section first.`,
    }
  }
  const doneLeft = sections.filter((s) => s.status_category === "done" && s.id !== sectionId).length
  return doneLeft > 0 ? { ok: true } : LAST_DONE
}

/** `orderedIds` must name every section of the project exactly once. */
export function checkReorder(currentIds: readonly number[], orderedIds: readonly number[]): boolean {
  if (orderedIds.length !== currentIds.length) return false
  const seen = new Set<number>()
  const current = new Set(currentIds)
  for (const id of orderedIds) {
    if (!current.has(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}

export type TaskPlacement = { project_id: number | null; section_id: number | null; status: string }

export type SectionMovePlan =
  | { ok: true; status: TaskStatus; statusChanges: boolean; project_id: number; section_id: number }
  | { ok: false; reason: "other_project"; message: string }

/**
 * Moving a task into a section: it joins the section's project (a task in no
 * project may join; a task in another project may not, plan 5.4 "same
 * project") and takes the section's status category.
 */
export function planSectionMove(
  task: TaskPlacement,
  section: Pick<CodexSection, "id" | "project_id" | "status_category">
): SectionMovePlan {
  if (task.project_id != null && task.project_id !== section.project_id) {
    return { ok: false, reason: "other_project", message: "This task belongs to another project." }
  }
  const status = statusForSectionCategory(section.status_category)
  return {
    ok: true,
    status,
    statusChanges: task.status !== status,
    project_id: section.project_id,
    section_id: section.id,
  }
}

export type CompletePlan =
  | SectionMovePlan
  | { ok: false; reason: "no_done_section"; message: string }

/**
 * Completing a task in a project moves it to the project's first done
 * section. A task already in a done section stays there (completing twice
 * changes nothing).
 */
export function planCompleteInProject(
  task: TaskPlacement,
  sections: readonly Pick<CodexSection, "id" | "project_id" | "sort_order" | "status_category">[]
): CompletePlan {
  const current = sections.find((s) => s.id === task.section_id)
  if (current && current.status_category === "done") return planSectionMove(task, current)
  const done = firstDoneSection(sections)
  if (!done) {
    return { ok: false, reason: "no_done_section", message: "This project has no done section." }
  }
  return planSectionMove(task, done)
}

// ---------------------------------------------------------------------------
// Input parsing (routes)
// ---------------------------------------------------------------------------

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string; message: string }

function fail(error: string, message: string): { ok: false; error: string; message: string } {
  return { ok: false, error, message }
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A real calendar date as YYYY-MM-DD. */
export function isCivilYmd(value: unknown): value is string {
  if (typeof value !== "string") return false
  const m = YMD.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
}

function readName(raw: unknown, max: number, field: string): ParseResult<string> {
  if (typeof raw !== "string" || !raw.trim()) return fail(`invalid_${field}`, `${field} is required.`)
  const name = raw.trim().replace(/\s+/g, " ")
  if (name.length > max) return fail(`invalid_${field}`, `${field} must be ${max} characters or fewer.`)
  return { ok: true, value: name }
}

function readEmail(raw: unknown, field: string): ParseResult<string> {
  const email = typeof raw === "string" ? normaliseEmail(raw) : ""
  if (!EMAIL.test(email) || email.length > 320) return fail(`invalid_${field}`, `${field} must be an email address.`)
  return { ok: true, value: email }
}

export function readEmailList(raw: unknown, field = "members"): ParseResult<string[]> {
  if (!Array.isArray(raw)) return fail(`invalid_${field}`, `${field} must be a list of email addresses.`)
  const out: string[] = []
  for (const item of raw) {
    const email = readEmail(item, field)
    if (!email.ok) return email
    if (!out.includes(email.value)) out.push(email.value)
  }
  if (out.length > MEMBERS_PER_PROJECT_MAX) {
    return fail(`invalid_${field}`, `A project can have up to ${MEMBERS_PER_PROJECT_MAX} members.`)
  }
  return { ok: true, value: out }
}

function readSectionDraft(raw: unknown): ParseResult<SectionDraft> {
  const obj = typeof raw === "string" ? { name: raw } : raw
  if (!obj || typeof obj !== "object") return fail("invalid_sections", "Each section needs a name.")
  const rec = obj as Record<string, unknown>
  const name = readName(rec.name, SECTION_NAME_MAX, "section_name")
  if (!name.ok) return name
  if (rec.status_category !== undefined && !isSectionStatusCategory(rec.status_category)) {
    return fail("invalid_status_category", `status_category must be one of: ${SECTION_STATUS_CATEGORIES.join(", ")}.`)
  }
  return {
    ok: true,
    value: {
      name: name.value,
      status_category: isSectionStatusCategory(rec.status_category) ? rec.status_category : suggestSectionCategory(name.value),
    },
  }
}

export type CreateProjectInput = {
  name: string
  kind: ProjectKind
  client_id: number | null
  mba_number: string | null
  owner_email: string | null
  is_private: boolean
  start_on: string | null
  due_on: string | null
  members: string[]
  sections: SectionDraft[] | undefined
}

function readOptionalDate(raw: unknown, field: string): ParseResult<string | null> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null }
  if (!isCivilYmd(raw)) return fail(`invalid_${field}`, `${field} must be a date (YYYY-MM-DD).`)
  return { ok: true, value: raw }
}

function readMba(raw: unknown): ParseResult<string | null> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null }
  if (typeof raw !== "string") return fail("invalid_mba_number", "mba_number must be text.")
  const mba = raw.trim()
  if (!mba) return { ok: true, value: null }
  if (mba.length > MBA_NUMBER_MAX || /\s/.test(mba)) {
    return fail("invalid_mba_number", `mba_number must be one word of ${MBA_NUMBER_MAX} characters or fewer.`)
  }
  return { ok: true, value: mba }
}

export function parseCreateProjectInput(body: unknown): ParseResult<CreateProjectInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  const name = readName(b.name, PROJECT_NAME_MAX, "name")
  if (!name.ok) return name
  if (!isProjectKind(b.kind)) return fail("invalid_kind", `kind must be one of: ${PROJECT_KINDS.join(", ")}.`)
  let clientId: number | null = null
  if (b.client_id !== undefined && b.client_id !== null && b.client_id !== "") {
    const n = Number(b.client_id)
    if (!Number.isSafeInteger(n) || n < 1) return fail("invalid_client_id", "client_id must be a client id.")
    clientId = n
  }
  const mba = readMba(b.mba_number)
  if (!mba.ok) return mba
  let owner: string | null = null
  if (b.owner_email !== undefined && b.owner_email !== null && b.owner_email !== "") {
    const o = readEmail(b.owner_email, "owner_email")
    if (!o.ok) return o
    owner = o.value
  }
  if (b.is_private !== undefined && typeof b.is_private !== "boolean") {
    return fail("invalid_is_private", "is_private must be true or false.")
  }
  const start = readOptionalDate(b.start_on, "start_on")
  if (!start.ok) return start
  const due = readOptionalDate(b.due_on, "due_on")
  if (!due.ok) return due
  if (start.value && due.value && due.value < start.value) {
    return fail("invalid_due_on", "due_on must be on or after start_on.")
  }
  let members: string[] = []
  if (b.members !== undefined) {
    const m = readEmailList(b.members)
    if (!m.ok) return m
    members = m.value
  }
  let sections: SectionDraft[] | undefined
  if (b.sections !== undefined) {
    if (!Array.isArray(b.sections)) return fail("invalid_sections", "sections must be a list.")
    if (b.sections.length >= SECTIONS_PER_PROJECT_MAX) {
      return fail("invalid_sections", `A project can have up to ${SECTIONS_PER_PROJECT_MAX} sections.`)
    }
    sections = []
    for (const raw of b.sections) {
      const s = readSectionDraft(raw)
      if (!s.ok) return s
      sections.push(s.value)
    }
  }
  return {
    ok: true,
    value: {
      name: name.value,
      kind: b.kind,
      client_id: clientId,
      mba_number: mba.value,
      owner_email: owner,
      is_private: b.is_private === true,
      start_on: start.value,
      due_on: due.value,
      members,
      sections,
    },
  }
}

export type UpdateProjectInput = {
  name?: string
  status?: ProjectStatus
  is_private?: boolean
  owner_email?: string | null
}

export function parseUpdateProjectInput(body: unknown): ParseResult<UpdateProjectInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  const out: UpdateProjectInput = {}
  if (b.name !== undefined) {
    const name = readName(b.name, PROJECT_NAME_MAX, "name")
    if (!name.ok) return name
    out.name = name.value
  }
  if (b.status !== undefined) {
    if (!isProjectStatus(b.status)) return fail("invalid_status", `status must be one of: ${PROJECT_STATUSES.join(", ")}.`)
    out.status = b.status
  }
  if (b.is_private !== undefined) {
    if (typeof b.is_private !== "boolean") return fail("invalid_is_private", "is_private must be true or false.")
    out.is_private = b.is_private
  }
  if (b.owner_email !== undefined) {
    if (b.owner_email === null || b.owner_email === "") {
      out.owner_email = null
    } else {
      const o = readEmail(b.owner_email, "owner_email")
      if (!o.ok) return o
      out.owner_email = o.value
    }
  }
  if (Object.keys(out).length === 0) return fail("nothing_to_update", "Send name, status, is_private or owner_email.")
  return { ok: true, value: out }
}

/** Changes that decide who can see a project. Owner or creator only. */
export function touchesProjectAccess(patch: UpdateProjectInput): boolean {
  return patch.is_private !== undefined || patch.owner_email !== undefined
}

export type CreateSectionInput = SectionDraft & { collapsed_default: boolean }

export function parseCreateSectionInput(body: unknown): ParseResult<CreateSectionInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  const draft = readSectionDraft({ name: b.name, status_category: b.status_category })
  if (!draft.ok) return draft
  if (b.collapsed_default !== undefined && typeof b.collapsed_default !== "boolean") {
    return fail("invalid_collapsed_default", "collapsed_default must be true or false.")
  }
  return { ok: true, value: { ...draft.value, collapsed_default: b.collapsed_default === true } }
}

export type UpdateSectionInput = {
  name?: string
  status_category?: SectionStatusCategory
  collapsed_default?: boolean
}

export function parseUpdateSectionInput(body: unknown): ParseResult<UpdateSectionInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  const out: UpdateSectionInput = {}
  if (b.name !== undefined) {
    const name = readName(b.name, SECTION_NAME_MAX, "section_name")
    if (!name.ok) return name
    out.name = name.value
  }
  if (b.status_category !== undefined) {
    if (!isSectionStatusCategory(b.status_category)) {
      return fail("invalid_status_category", `status_category must be one of: ${SECTION_STATUS_CATEGORIES.join(", ")}.`)
    }
    out.status_category = b.status_category
  }
  if (b.collapsed_default !== undefined) {
    if (typeof b.collapsed_default !== "boolean") {
      return fail("invalid_collapsed_default", "collapsed_default must be true or false.")
    }
    out.collapsed_default = b.collapsed_default
  }
  if (Object.keys(out).length === 0) {
    return fail("nothing_to_update", "Send name, status_category or collapsed_default.")
  }
  return { ok: true, value: out }
}

/** A positive whole number id (route segment or body), else null. */
export function parseId(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? raw : null
  if (typeof raw !== "string") return null
  return /^[1-9]\d{0,15}$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null
}

export function parseReorderInput(body: unknown): ParseResult<number[]> {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).ordered_ids : undefined
  if (!Array.isArray(raw) || raw.length === 0) return fail("invalid_ordered_ids", "ordered_ids must list the section ids.")
  const ids: number[] = []
  for (const item of raw) {
    const id = parseId(item)
    if (id == null) return fail("invalid_ordered_ids", "ordered_ids must be section ids.")
    ids.push(id)
  }
  return { ok: true, value: ids }
}

/**
 * `after_task_id` (B39, the board): absent places by `sort_order` or last;
 * null places first; an id places right after that task in the section.
 */
export type MoveTaskInput = { task_id: number; sort_order: number | null; after_task_id?: number | null }

export function parseMoveTaskInput(body: unknown): ParseResult<MoveTaskInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  const taskId = parseId(b.task_id)
  if (taskId == null) return fail("invalid_task_id", "task_id must be a task id.")
  if ("after_task_id" in b) {
    if (b.sort_order !== undefined && b.sort_order !== null) {
      return fail("invalid_placement", "Send sort_order or after_task_id, not both.")
    }
    if (b.after_task_id === null) return { ok: true, value: { task_id: taskId, sort_order: null, after_task_id: null } }
    const after = parseId(b.after_task_id)
    if (after == null || after === taskId) return fail("invalid_after_task_id", "after_task_id must be another task id or null.")
    return { ok: true, value: { task_id: taskId, sort_order: null, after_task_id: after } }
  }
  let sortOrder: number | null = null
  if (b.sort_order !== undefined && b.sort_order !== null) {
    if (typeof b.sort_order !== "number" || !Number.isInteger(b.sort_order) || b.sort_order < 0 || b.sort_order > INT4_MAX) {
      return fail("invalid_sort_order", "sort_order must be a whole number from 0.")
    }
    sortOrder = b.sort_order
  }
  return { ok: true, value: { task_id: taskId, sort_order: sortOrder } }
}

// ---------------------------------------------------------------------------
// B39: status changes from the Tasks list, bulk and board on a project task
// ---------------------------------------------------------------------------

export type StatusChangePlan =
  | { ok: true; inProject: false }
  | (Extract<SectionMovePlan, { ok: true }> & { inProject: true })
  | { ok: false; reason: "no_section_for_status"; message: string }

const STATUS_WORDS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
}

/**
 * A status change on a task (PATCH, bulk, the Tasks board drag). A task in
 * no project changes as before. A task in a project changes status only by
 * moving section (plan 5.2):
 * - its section already has that category: it stays;
 * - done: the first done section (planCompleteInProject);
 * - else the first section in board order with that category;
 * - no such section (backlog never has one): refused, nothing changes.
 */
export function planStatusChangeInProject(
  task: TaskPlacement,
  sections: readonly Pick<CodexSection, "id" | "project_id" | "sort_order" | "status_category">[],
  status: string
): StatusChangePlan {
  if (task.project_id == null) return { ok: true, inProject: false }
  const noSection = {
    ok: false as const,
    reason: "no_section_for_status" as const,
    message: `No section in this task's project has the ${STATUS_WORDS[status] ?? status} status. Move the task on the project board.`,
  }
  const ordered = sortSections(sections)
  const current = ordered.find((s) => s.id === task.section_id)
  let target: (typeof ordered)[number] | undefined
  if (current && statusForSectionCategory(current.status_category) === status) {
    target = current
  } else if (status === "done") {
    target = firstDoneSection(ordered) ?? undefined
  } else {
    target = ordered.find((s) => statusForSectionCategory(s.status_category) === status)
  }
  if (!target) return noSection
  const plan = planSectionMove(task, target)
  if (!plan.ok) return noSection
  return { ...plan, inProject: true }
}

/**
 * Card order inside a section after placing `taskId` right after
 * `afterTaskId` (null: first). `orderedIds` is the section's live tasks in
 * board order and may or may not hold `taskId` already. Null when the anchor
 * is not in the section.
 */
export function orderAfterPlacement(
  orderedIds: readonly number[],
  taskId: number,
  afterTaskId: number | null
): number[] | null {
  const rest = orderedIds.filter((id) => id !== taskId)
  if (afterTaskId == null) return [taskId, ...rest]
  if (afterTaskId === taskId) return null
  const at = rest.indexOf(afterTaskId)
  if (at < 0) return null
  return [...rest.slice(0, at + 1), taskId, ...rest.slice(at + 1)]
}

// ---------------------------------------------------------------------------
// B39: bulk paste and inline add
// ---------------------------------------------------------------------------

/** Most lines one paste may create (plan 4.2, the rebuild). */
export const BULK_PASTE_MAX = 200

export type PastedTitles = {
  /** Trimmed, inner whitespace collapsed, blank lines dropped, in order. */
  titles: string[]
  /** Blank lines ignored. */
  blank: number
  /** 1-based line numbers longer than TASK_TITLE_MAX. */
  tooLong: number[]
  /** More than BULK_PASTE_MAX titles: refused as a whole, never cut. */
  overCap: boolean
}

/** One line per task. Used by the paste preview and the server. */
export function parsePastedTaskTitles(text: string): PastedTitles {
  const titles: string[] = []
  const tooLong: number[] = []
  let blank = 0
  const lines = String(text ?? "").split(/\r\n|\r|\n/)
  lines.forEach((raw, i) => {
    const title = raw.trim().replace(/\s+/g, " ")
    if (!title) {
      blank += 1
      return
    }
    if (title.length > TASK_TITLE_MAX) tooLong.push(i + 1)
    titles.push(title)
  })
  // A trailing newline is not a blank line someone typed.
  if (lines.length > 0 && lines[lines.length - 1].trim() === "" && blank > 0) blank -= 1
  return { titles, blank, tooLong, overCap: titles.length > BULK_PASTE_MAX }
}

export type CreateSectionTasksInput = { titles: string[] }

/** `{ titles: [...] }`, 1 to BULK_PASTE_MAX non-blank titles of TASK_TITLE_MAX or fewer. */
export function parseCreateSectionTasksInput(body: unknown): ParseResult<CreateSectionTasksInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const raw = (body as Record<string, unknown>).titles
  if (!Array.isArray(raw)) return fail("invalid_titles", "titles must be a list of task titles.")
  if (raw.some((t) => typeof t !== "string")) return fail("invalid_titles", "Each title must be text.")
  const parsed = parsePastedTaskTitles((raw as string[]).map((t) => t.replace(/[\r\n]+/g, " ")).join("\n"))
  if (parsed.titles.length === 0) return fail("invalid_titles", "Send at least one task title.")
  if (parsed.overCap) return fail("too_many_titles", `Paste up to ${BULK_PASTE_MAX} tasks at a time.`)
  if (parsed.tooLong.length > 0) {
    return fail("invalid_titles", `Each title must be ${TASK_TITLE_MAX} characters or fewer.`)
  }
  return { ok: true, value: { titles: parsed.titles } }
}
