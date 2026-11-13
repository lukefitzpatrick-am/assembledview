/**
 * Codex custom fields (S1, B40, plan 4.2 and 10): pure rules. No database,
 * no server-only, so the board, the list view and the settings panel use
 * the same rules as the server.
 *
 * - A field belongs to one project (`codex_custom_fields`). Single-select
 *   and multi-select (tags) are built; `text` and `date` exist in the 0118
 *   check but are refused here until they are built.
 * - Options are `[{ id, label }]` in `options` jsonb. The id is stable, so a
 *   rename or a reorder keeps every task's value. Ids are `o1`, `o2`, ...
 *   and never reused within a field: a removed option stays in the jsonb as
 *   `{ id, label, removed: true }` (B40fix), so the next new option counts
 *   past it, and a soft-deleted task's value, a saved list filter or an
 *   activity row naming it never comes to mean a new option. Readers drop
 *   removed entries (`readStoredOptions`).
 * - A task's values live in `tasks.custom_values` keyed by field id:
 *   `{ "12": "o3" }` (single) or `{ "13": ["o1", "o4"] }` (multi). No value
 *   is no key.
 * - Removing an option that a live task uses, or deleting a field that any
 *   live task has a value for, is refused (the safe option): clear the
 *   values first. Nothing is ever cleared silently.
 * - `done_option` (single-select only) is stored for the SEO progress rule
 *   (B42). Nothing acts on it yet.
 */

export const BUILT_FIELD_TYPES = ["single_select", "multi_select"] as const
export type CustomFieldType = (typeof BUILT_FIELD_TYPES)[number]

export const FIELD_NAME_MAX = 80
export const OPTION_LABEL_MAX = 80
export const OPTIONS_PER_FIELD_MAX = 50
export const FIELDS_PER_PROJECT_MAX = 20

export type CustomFieldOption = { id: string; label: string }

/** An entry of `options` jsonb: a live option, or a removed one kept so its id is never reused. */
export type StoredFieldOption = CustomFieldOption & { removed?: true }

export type CodexCustomField = {
  id: number
  project_id: number
  name: string
  field_type: CustomFieldType
  options: CustomFieldOption[]
  done_option: string | null
}

/** A task's values: field id (as text) to an option id or a list of them. */
export type CustomValues = Record<string, string | string[]>

export type FieldParse<T> = { ok: true; value: T } | { ok: false; error: string; message: string }

function fail(error: string, message: string): { ok: false; error: string; message: string } {
  return { ok: false, error, message }
}

export function isBuiltFieldType(value: unknown): value is CustomFieldType {
  return typeof value === "string" && (BUILT_FIELD_TYPES as readonly string[]).includes(value)
}

function cleanText(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : ""
}

function readFieldName(raw: unknown): FieldParse<string> {
  const name = cleanText(raw)
  if (!name) return fail("invalid_name", "The field needs a name.")
  if (name.length > FIELD_NAME_MAX) return fail("invalid_name", `Field names are ${FIELD_NAME_MAX} characters or fewer.`)
  return { ok: true, value: name }
}

function readLabel(raw: unknown): FieldParse<string> {
  const label = cleanText(raw)
  if (!label) return fail("invalid_options", "Each option needs a label.")
  if (label.length > OPTION_LABEL_MAX) {
    return fail("invalid_options", `Option labels are ${OPTION_LABEL_MAX} characters or fewer.`)
  }
  return { ok: true, value: label }
}

function duplicateLabel(labels: readonly string[]): string | null {
  const seen = new Set<string>()
  for (const label of labels) {
    const key = label.toLowerCase()
    if (seen.has(key)) return label
    seen.add(key)
  }
  return null
}

/** The next unused option id after every id in `existing` (o1, o2, ...). */
export function nextOptionNumber(existing: readonly string[]): number {
  let max = 0
  for (const id of existing) {
    const m = /^o(\d{1,9})$/.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

function readOptionEntries(raw: unknown, removed: boolean): CustomFieldOption[] {
  if (!Array.isArray(raw)) return []
  const out: CustomFieldOption[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    if (typeof rec.id !== "string" || typeof rec.label !== "string" || seen.has(rec.id)) continue
    seen.add(rec.id)
    if ((rec.removed === true) === removed) out.push({ id: rec.id, label: rec.label })
  }
  return out
}

/** Live options as stored, from whatever jsonb holds (bad and removed entries dropped). */
export function readStoredOptions(raw: unknown): CustomFieldOption[] {
  return readOptionEntries(raw, false)
}

/** Removed options kept in the jsonb so their ids are never reused (B40fix). */
export function readRemovedOptions(raw: unknown): CustomFieldOption[] {
  return readOptionEntries(raw, true)
}

export type CreateFieldInput = {
  name: string
  field_type: CustomFieldType
  options: CustomFieldOption[]
  done_option: string | null
}

/**
 * `{ name, field_type, options: ["Not started", ...], done_option?: "Done" }`.
 * Option ids are given here (o1..). `done_option` names one of the labels
 * and is for single-select only.
 */
export function parseCreateFieldInput(body: unknown): FieldParse<CreateFieldInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  const name = readFieldName(b.name)
  if (!name.ok) return name
  if (!isBuiltFieldType(b.field_type)) {
    return fail("invalid_field_type", "field_type must be single_select or multi_select.")
  }
  if (!Array.isArray(b.options) || b.options.length === 0) {
    return fail("invalid_options", "A field needs at least one option.")
  }
  if (b.options.length > OPTIONS_PER_FIELD_MAX) {
    return fail("invalid_options", `A field can have up to ${OPTIONS_PER_FIELD_MAX} options.`)
  }
  const labels: string[] = []
  for (const raw of b.options) {
    const label = readLabel(typeof raw === "object" && raw ? (raw as Record<string, unknown>).label : raw)
    if (!label.ok) return label
    labels.push(label.value)
  }
  const dup = duplicateLabel(labels)
  if (dup) return fail("invalid_options", `"${dup}" is listed twice.`)
  const options = labels.map((label, i) => ({ id: `o${i + 1}`, label }))
  let doneOption: string | null = null
  if (b.done_option !== undefined && b.done_option !== null && b.done_option !== "") {
    if (b.field_type !== "single_select") {
      return fail("invalid_done_option", "Only a single-select field has a done option.")
    }
    const want = cleanText(b.done_option).toLowerCase()
    const hit = options.find((o) => o.label.toLowerCase() === want)
    if (!hit) return fail("invalid_done_option", "done_option must be one of the options.")
    doneOption = hit.id
  }
  return { ok: true, value: { name: name.value, field_type: b.field_type, options, done_option: doneOption } }
}

/**
 * PATCH: `name`, `options` (the whole list in its new order: an entry with
 * an `id` keeps that option, renamed to its label; an entry without one is
 * new; an id left out is removed) and `done_option` (an option id, or null).
 * The type never changes.
 */
export type UpdateFieldInput = {
  name?: string
  options?: Array<{ id: string | null; label: string }>
  done_option?: string | null
}

export function parseUpdateFieldInput(body: unknown): FieldParse<UpdateFieldInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  if (b.field_type !== undefined) return fail("invalid_field_type", "A field's type cannot change. Make a new field.")
  const out: UpdateFieldInput = {}
  if (b.name !== undefined) {
    const name = readFieldName(b.name)
    if (!name.ok) return name
    out.name = name.value
  }
  if (b.options !== undefined) {
    if (!Array.isArray(b.options) || b.options.length === 0) {
      return fail("invalid_options", "A field needs at least one option.")
    }
    if (b.options.length > OPTIONS_PER_FIELD_MAX) {
      return fail("invalid_options", `A field can have up to ${OPTIONS_PER_FIELD_MAX} options.`)
    }
    const list: Array<{ id: string | null; label: string }> = []
    const ids = new Set<string>()
    for (const raw of b.options) {
      const rec: Record<string, unknown> = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : { label: raw }
      const label = readLabel(rec.label)
      if (!label.ok) return label
      let id: string | null = null
      if (rec.id !== undefined && rec.id !== null && rec.id !== "") {
        if (typeof rec.id !== "string" || !/^o\d{1,9}$/.test(rec.id)) return fail("invalid_options", "Unknown option id.")
        if (ids.has(rec.id)) return fail("invalid_options", "An option is listed twice.")
        ids.add(rec.id)
        id = rec.id
      }
      list.push({ id, label: label.value })
    }
    const dup = duplicateLabel(list.map((o) => o.label))
    if (dup) return fail("invalid_options", `"${dup}" is listed twice.`)
    out.options = list
  }
  if (b.done_option !== undefined) {
    if (b.done_option === null || b.done_option === "") out.done_option = null
    else if (typeof b.done_option === "string" && /^o\d{1,9}$/.test(b.done_option)) out.done_option = b.done_option
    else return fail("invalid_done_option", "done_option must be an option id or null.")
  }
  if (Object.keys(out).length === 0) return fail("nothing_to_update", "Send name, options or done_option.")
  return { ok: true, value: out }
}

export type FieldRuleFailure = {
  ok: false
  reason: "option_in_use" | "field_has_values" | "unknown_option" | "invalid_done_option" | "too_many_fields" | "progress_field_invalid"
  message: string
}

/**
 * The field after a PATCH. `usage` counts live tasks per option id;
 * `removed` is the field's removed options as stored. Refuses an id that is
 * not a live option of the field (a removed one never comes back), removing
 * an option a live task still uses, and a done option that is not an option
 * (or on a multi-select). A removed option that was the done option clears
 * it. A new option takes the next number after every id the field has ever
 * had; `stored` is what to write to `options` jsonb (live options, then
 * every removed one marked `removed: true`).
 */
export function planFieldUpdate(
  field: CodexCustomField,
  patch: UpdateFieldInput,
  usage: Readonly<Record<string, number>>,
  removed: readonly CustomFieldOption[] = []
): { ok: true; field: CodexCustomField; stored: StoredFieldOption[] } | FieldRuleFailure {
  let options = field.options
  let retired: CustomFieldOption[] = [...removed]
  if (patch.options) {
    const known = new Set(field.options.map((o) => o.id))
    for (const o of patch.options) {
      if (o.id != null && !known.has(o.id)) {
        return { ok: false, reason: "unknown_option", message: "One of the options is not on this field. Reload and try again." }
      }
    }
    const kept = new Set(patch.options.map((o) => o.id).filter((id): id is string => id != null))
    const removedInUse = field.options.filter((o) => !kept.has(o.id) && (usage[o.id] ?? 0) > 0)
    if (removedInUse.length > 0) {
      const o = removedInUse[0]
      const n = usage[o.id] ?? 0
      return {
        ok: false,
        reason: "option_in_use",
        message: `${n} task${n === 1 ? " uses" : "s use"} "${o.label}". Change ${n === 1 ? "it" : "them"} first.`,
      }
    }
    for (const o of field.options) {
      if (!kept.has(o.id) && !retired.some((r) => r.id === o.id)) retired = [...retired, { id: o.id, label: o.label }]
    }
    let next = nextOptionNumber([...field.options, ...removed].map((o) => o.id))
    options = patch.options.map((o) => {
      if (o.id != null) return { id: o.id, label: o.label }
      const id = `o${next}`
      next += 1
      return { id, label: o.label }
    })
  }
  let doneOption = field.done_option
  if (doneOption != null && !options.some((o) => o.id === doneOption)) doneOption = null
  if (patch.done_option !== undefined) {
    if (patch.done_option != null) {
      if (field.field_type !== "single_select") {
        return { ok: false, reason: "invalid_done_option", message: "Only a single-select field has a done option." }
      }
      if (!options.some((o) => o.id === patch.done_option)) {
        return { ok: false, reason: "invalid_done_option", message: "The done option must be one of the options." }
      }
    }
    doneOption = patch.done_option
  }
  const live = new Set(options.map((o) => o.id))
  const stored: StoredFieldOption[] = [
    ...options,
    ...retired.filter((o) => !live.has(o.id)).map((o) => ({ id: o.id, label: o.label, removed: true as const })),
  ]
  return { ok: true, field: { ...field, name: patch.name ?? field.name, options, done_option: doneOption }, stored }
}

/** A field is deleted only when no live task has a value for it. */
export function checkDeleteField(liveValues: number): { ok: true } | FieldRuleFailure {
  if (liveValues > 0) {
    return {
      ok: false,
      reason: "field_has_values",
      message: `${liveValues} task${liveValues === 1 ? " has" : "s have"} a value for this field. Clear ${liveValues === 1 ? "it" : "them"} first.`,
    }
  }
  return { ok: true }
}

export function checkFieldCount(existing: number): { ok: true } | FieldRuleFailure {
  return existing >= FIELDS_PER_PROJECT_MAX
    ? { ok: false, reason: "too_many_fields", message: `A project can have up to ${FIELDS_PER_PROJECT_MAX} fields.` }
    : { ok: true }
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** `custom_values` in a PATCH: field id to an option id, a list of them, or null (clear). */
export type CustomValuesPatch = Record<string, string | string[] | null>

export function parseCustomValuesPatch(raw: unknown): FieldParse<CustomValuesPatch> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("invalid_custom_values", "custom_values must be an object of field id to value.")
  }
  const out: CustomValuesPatch = {}
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length === 0) return fail("invalid_custom_values", "custom_values is empty.")
  if (entries.length > FIELDS_PER_PROJECT_MAX) return fail("invalid_custom_values", "Too many fields in one change.")
  for (const [key, value] of entries) {
    if (!/^[1-9]\d{0,15}$/.test(key)) return fail("invalid_custom_values", "custom_values keys are field ids.")
    if (value === null || value === "") out[key] = null
    else if (typeof value === "string") out[key] = value
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) out[key] = value as string[]
    else return fail("invalid_custom_values", "A value is an option id, a list of option ids, or null.")
  }
  return { ok: true, value: out }
}

export type ValueRuleFailure = { ok: false; reason: "unknown_field" | "invalid_value"; message: string }

/**
 * Check a patch against the project's fields and apply it. Single-select
 * takes one option id; multi-select a list of distinct option ids (order
 * kept, an empty list clears). Every id must be an option of that field;
 * every field must belong to the task's project.
 */
export function applyCustomValuesPatch(
  current: CustomValues,
  patch: CustomValuesPatch,
  fields: readonly CodexCustomField[]
): { ok: true; values: CustomValues } | ValueRuleFailure {
  const next: CustomValues = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const field = fields.find((f) => String(f.id) === key)
    if (!field) return { ok: false, reason: "unknown_field", message: "That field is not on this task's project." }
    const ids = new Set(field.options.map((o) => o.id))
    if (value == null || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
      continue
    }
    if (field.field_type === "single_select") {
      if (typeof value !== "string" || !ids.has(value)) {
        return { ok: false, reason: "invalid_value", message: `Pick one of the ${field.name} options.` }
      }
      next[key] = value
    } else {
      const list = typeof value === "string" ? [value] : value
      if (new Set(list).size !== list.length || list.some((v) => !ids.has(v))) {
        return { ok: false, reason: "invalid_value", message: `Pick ${field.name} options from the list, each once.` }
      }
      next[key] = [...list]
    }
  }
  return { ok: true, values: next }
}

/** Values as stored (jsonb), keeping only string or string-list entries. */
export function readStoredValues(raw: unknown): CustomValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: CustomValues = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) out[key] = value as string[]
  }
  return out
}

/** Option ids a task holds for a field, as a list (single or multi). */
export function valueIds(values: CustomValues | null | undefined, fieldId: number): string[] {
  const v = values?.[String(fieldId)]
  if (v == null) return []
  return typeof v === "string" ? [v] : v
}

/** Labels for a task's value on a field, in option order for multi-select. */
export function valueLabels(field: CodexCustomField, values: CustomValues | null | undefined): string[] {
  const held = valueIds(values, field.id)
  if (held.length === 0) return []
  if (field.field_type === "single_select") {
    const o = field.options.find((opt) => opt.id === held[0])
    return o ? [o.label] : []
  }
  const set = new Set(held)
  return field.options.filter((o) => set.has(o.id)).map((o) => o.label)
}

// ---------------------------------------------------------------------------
// Card chips (codex_board_configs.card_fields, plan 5.4)
// ---------------------------------------------------------------------------

/** `card_fields`: `[{ key: "field:<id>", show: boolean }]`. A field not listed shows. */
export type CardFieldSetting = { key: string; show: boolean }

export function cardFieldKey(fieldId: number): string {
  return `field:${fieldId}`
}

export function readCardFields(raw: unknown): CardFieldSetting[] {
  if (!Array.isArray(raw)) return []
  const out: CardFieldSetting[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    if (typeof rec.key === "string" && /^field:[1-9]\d{0,15}$/.test(rec.key) && typeof rec.show === "boolean") {
      if (!out.some((o) => o.key === rec.key)) out.push({ key: rec.key, show: rec.show })
    }
  }
  return out
}

export function parseCardFieldsInput(body: unknown): FieldParse<CardFieldSetting[]> {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).card_fields : undefined
  if (!Array.isArray(raw)) return fail("invalid_card_fields", "card_fields must be a list of { key, show }.")
  if (raw.length > FIELDS_PER_PROJECT_MAX * 2) return fail("invalid_card_fields", "Too many card fields.")
  const parsed = readCardFields(raw)
  if (parsed.length !== raw.length) {
    return fail("invalid_card_fields", 'Each entry is { key: "field:<id>", show: true or false }, each key once.')
  }
  return { ok: true, value: parsed }
}

/** The fields whose chips show on cards, in field order. */
export function visibleCardFields(
  fields: readonly CodexCustomField[],
  settings: readonly CardFieldSetting[]
): CodexCustomField[] {
  const hidden = new Set(settings.filter((s) => !s.show).map((s) => s.key))
  return fields.filter((f) => !hidden.has(cardFieldKey(f.id)))
}

// ---------------------------------------------------------------------------
// The progress field (B42, plan 4.2, the SEO rule)
// ---------------------------------------------------------------------------

/** A project's linked progress field and its done option (both live). */
export type ProgressRule = { fieldId: number; doneOption: string }

/**
 * The rule a linked field gives, or null when it gives none: only a
 * single-select field whose done option is a live option (a removed option,
 * kept in the jsonb as `removed: true`, never counts; B40fix).
 */
export function progressRuleFromField(field: {
  id: number
  field_type: string
  options: unknown
  done_option: string | null
}): ProgressRule | null {
  if (field.field_type !== "single_select" || !field.done_option) return null
  const live = readStoredOptions(field.options)
  return live.some((o) => o.id === field.done_option) ? { fieldId: Number(field.id), doneOption: field.done_option } : null
}

/** Why a field cannot be linked as the progress field, or null when it can. */
export function checkProgressFieldLink(field: { field_type: string; options: unknown; done_option: string | null } | null): FieldRuleFailure | null {
  if (!field) return { ok: false, reason: "progress_field_invalid", message: "That field is not in this project." }
  if (field.field_type !== "single_select") {
    return { ok: false, reason: "progress_field_invalid", message: "The progress field must be a single-select field." }
  }
  if (!progressRuleFromField({ id: 0, ...field })) {
    return { ok: false, reason: "progress_field_invalid", message: "Pick a done option for this field first." }
  }
  return null
}

/** Setting the field to its done option completes the task. */
export function valuesCompleteTask(rule: ProgressRule | null, values: CustomValues | null | undefined): boolean {
  return rule != null && values != null && values[String(rule.fieldId)] === rule.doneOption
}

export type ProgressPatchDecision =
  | { kind: "none" }
  | { kind: "complete" }
  | { kind: "conflict"; reason: "progress_conflict"; message: string }

export const PROGRESS_CONFLICT_OPEN =
  "Setting the progress field to its done option completes the task, so it cannot be sent with an open status. Send one or the other."
export const PROGRESS_CONFLICT_DONE =
  "Completing the task sets the progress field to its done option, so it cannot be set to another option in the same change. Send one or the other."

/**
 * F7 (B42fix): one rule for a PATCH that may send a status and the progress
 * field together. Only the field as sent in this change counts (a value
 * already stored, such as a reopened task's done value, never completes the
 * task again).
 * - Status sent: it decides. A done status with the field set to another
 *   option, or an open status with the field set to its done option, is
 *   refused (409 `progress_conflict`), nothing changed. A done status sets
 *   the field (`markProgressDone`).
 * - No status: the field set to its done option completes an open task.
 */
export function progressPatchDecision(
  rule: ProgressRule | null,
  patch: CustomValuesPatch | null | undefined,
  status: string | undefined,
  currentStatus: string
): ProgressPatchDecision {
  if (rule == null || patch == null) return { kind: "none" }
  const key = String(rule.fieldId)
  if (!Object.prototype.hasOwnProperty.call(patch, key)) return { kind: "none" }
  const setsDone = patch[key] === rule.doneOption
  if (status !== undefined) {
    if (status === "done" && !setsDone) return { kind: "conflict", reason: "progress_conflict", message: PROGRESS_CONFLICT_DONE }
    if (status !== "done" && setsDone) return { kind: "conflict", reason: "progress_conflict", message: PROGRESS_CONFLICT_OPEN }
    return { kind: "none" }
  }
  return setsDone && currentStatus !== "done" ? { kind: "complete" } : { kind: "none" }
}

/** Completing a task sets the field to the done option: the values after, or null when already set. */
export function valuesOnComplete(rule: ProgressRule, values: CustomValues | null | undefined): CustomValues | null {
  const current = values ?? {}
  if (current[String(rule.fieldId)] === rule.doneOption) return null
  return { ...current, [String(rule.fieldId)]: rule.doneOption }
}
