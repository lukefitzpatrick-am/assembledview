/**
 * Codex custom fields store (S1, B40): a project's field definitions and the
 * card chip settings. Behind codex_projects (routes) and the 0118 marker
 * (here: ProjectsUnavailableError, routes 503). Rules in
 * lib/codex/customFields.ts.
 *
 * Any staff member who can see the project manages its fields, as with
 * sections. Each change locks the project row first, then reads usage, so a
 * value written in parallel cannot slip past the "option in use" refusal.
 */
import "server-only"

import { and, eq, sql } from "drizzle-orm"

import { db, schema, type Db } from "@/db"
import {
  checkDeleteField,
  checkFieldCount,
  planFieldUpdate,
  readRemovedOptions,
  type CardFieldSetting,
  type CodexCustomField,
  type CreateFieldInput,
  type UpdateFieldInput,
} from "@/lib/codex/customFields"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { normaliseEmail } from "@/lib/codex/projects"
import { projectBoardScope } from "@/lib/codex/projectBoard"
import {
  appendActivity,
  guarded,
  loadProjectCardFields,
  loadProjectFields,
  loadVisibleProject,
  projectCardFieldsWhere,
  type ProjectFailure,
} from "@/lib/codex/projectsRepo"

const { codexCustomFields, codexBoardConfigs } = schema

const NOT_FOUND: ProjectFailure = { ok: false, reason: "not_found", message: "Project not found." }
const FIELD_NOT_FOUND: ProjectFailure = { ok: false, reason: "not_found", message: "Field not found." }

export type ProjectFields = { ok: true; fields: CodexCustomField[]; card_fields: CardFieldSetting[] }

export async function listProjectFields(
  projectId: number,
  viewerEmail: string,
  database: Db = db
): Promise<ProjectFields | ProjectFailure> {
  return guarded(database, async () => {
    if (!(await loadVisibleProject(database, projectId, viewerEmail))) return NOT_FOUND
    return {
      ok: true as const,
      fields: await loadProjectFields(database, projectId),
      card_fields: await loadProjectCardFields(database, projectId),
    }
  })
}

export async function createCustomField(
  projectId: number,
  viewerEmail: string,
  input: CreateFieldInput,
  database: Db = db
): Promise<{ ok: true; field: CodexCustomField } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      if (!(await loadVisibleProject(tx, projectId, viewerEmail, true))) return NOT_FOUND
      const existing = await loadProjectFields(tx, projectId)
      const count = checkFieldCount(existing.length)
      if (!count.ok) return count
      const [row] = await tx
        .insert(codexCustomFields)
        .values({ projectId, name: input.name, fieldType: input.field_type, options: input.options, doneOption: input.done_option })
        .returning({ id: codexCustomFields.id })
      const field: CodexCustomField = { id: Number(row.id), project_id: projectId, ...input }
      await appendActivity(tx, { entityType: "codex_custom_field", entityId: field.id, actorEmail: viewerEmail, action: "create", after: field })
      return { ok: true as const, field }
    })
  )
}

/** Live tasks of the project per option id of one field. */
async function optionUsage(tx: Parameters<typeof loadProjectFields>[0], projectId: number, fieldId: number): Promise<Record<string, number>> {
  const key = String(fieldId)
  const rows = executeRows(
    await tx.execute(sql`
      SELECT o.opt, count(*)::int AS n
        FROM public.tasks t,
             LATERAL jsonb_array_elements_text(
               CASE jsonb_typeof(t.custom_values -> ${key})
                 WHEN 'array' THEN t.custom_values -> ${key}
                 WHEN 'string' THEN jsonb_build_array(t.custom_values -> ${key})
                 ELSE '[]'::jsonb
               END) AS o(opt)
       WHERE t.project_id = ${projectId} AND t.deleted_at IS NULL AND t.custom_values ? ${key}
       GROUP BY o.opt
    `)
  )
  return Object.fromEntries(rows.map((r) => [String(r.opt), Number(r.n) || 0]))
}

export async function updateCustomField(
  projectId: number,
  fieldId: number,
  viewerEmail: string,
  patch: UpdateFieldInput,
  database: Db = db
): Promise<{ ok: true; field: CodexCustomField } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      if (!(await loadVisibleProject(tx, projectId, viewerEmail, true))) return NOT_FOUND
      const before = (await loadProjectFields(tx, projectId)).find((f) => f.id === fieldId)
      if (!before) return FIELD_NOT_FOUND
      // Removed options stay in the jsonb so a new option never takes their id (B40fix).
      const [raw] = await tx
        .select({ options: codexCustomFields.options })
        .from(codexCustomFields)
        .where(and(eq(codexCustomFields.id, fieldId), eq(codexCustomFields.projectId, projectId)))
      const plan = planFieldUpdate(
        before,
        patch,
        patch.options ? await optionUsage(tx, projectId, fieldId) : {},
        readRemovedOptions(raw?.options)
      )
      if (!plan.ok) return plan
      await tx
        .update(codexCustomFields)
        .set({ name: plan.field.name, options: plan.stored, doneOption: plan.field.done_option })
        .where(and(eq(codexCustomFields.id, fieldId), eq(codexCustomFields.projectId, projectId)))
      await appendActivity(tx, {
        entityType: "codex_custom_field",
        entityId: fieldId,
        actorEmail: viewerEmail,
        action: "update",
        before,
        after: plan.field,
      })
      return { ok: true as const, field: plan.field }
    })
  )
}

/** Refused while any live task of the project has a value for it. */
export async function deleteCustomField(
  projectId: number,
  fieldId: number,
  viewerEmail: string,
  database: Db = db
): Promise<{ ok: true } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      if (!(await loadVisibleProject(tx, projectId, viewerEmail, true))) return NOT_FOUND
      const field = (await loadProjectFields(tx, projectId)).find((f) => f.id === fieldId)
      if (!field) return FIELD_NOT_FOUND
      const [countRow] = executeRows(
        await tx.execute(sql`
          SELECT count(*)::int AS n FROM public.tasks
           WHERE project_id = ${projectId} AND deleted_at IS NULL AND custom_values ? ${String(fieldId)}
        `)
      )
      const rule = checkDeleteField(Number(countRow?.n ?? 0) || 0)
      if (!rule.ok) return rule
      await tx.delete(codexCustomFields).where(and(eq(codexCustomFields.id, fieldId), eq(codexCustomFields.projectId, projectId)))
      await appendActivity(tx, { entityType: "codex_custom_field", entityId: fieldId, actorEmail: viewerEmail, action: "delete", before: field })
      return { ok: true as const }
    })
  )
}

/**
 * Which field chips show on this project's cards, for everyone (one row per
 * project, `scope` `project:<id>`, no owner; the per-person rows hold hide
 * completed). Settings for fields not on the project are dropped.
 */
export async function setProjectCardFields(
  projectId: number,
  viewerEmail: string,
  settings: readonly CardFieldSetting[],
  database: Db = db
): Promise<{ ok: true; card_fields: CardFieldSetting[] } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      if (!(await loadVisibleProject(tx, projectId, viewerEmail))) return NOT_FOUND
      const known = new Set((await loadProjectFields(tx, projectId)).map((f) => `field:${f.id}`))
      const kept = settings.filter((s) => known.has(s.key))
      const scope = projectBoardScope(projectId)
      // codex_board_configs has no unique key on (scope, owner): one writer at a time per project row.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`codex_board_configs:${scope}:project`}))`)
      const [row] = await tx
        .select({ id: codexBoardConfigs.id })
        .from(codexBoardConfigs)
        .where(projectCardFieldsWhere(projectId))
        .orderBy(sql`${codexBoardConfigs.id} desc`)
        .limit(1)
      if (row) {
        await tx.update(codexBoardConfigs).set({ cardFields: kept }).where(eq(codexBoardConfigs.id, row.id))
      } else {
        await tx.insert(codexBoardConfigs).values({ scope, ownerEmail: null, groupBy: "section", cardFields: kept })
      }
      await appendActivity(tx, {
        entityType: "codex_project",
        entityId: projectId,
        actorEmail: normaliseEmail(viewerEmail),
        action: "card_fields",
        after: { card_fields: kept },
      })
      return { ok: true as const, card_fields: kept }
    })
  )
}
