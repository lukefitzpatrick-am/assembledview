import "server-only"

import { eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { mapScopeOfWorkFromPostgres } from "@/lib/data/readFinance"

export type ScopeOfWorkWritable = {
  client_name: string
  contact_name: string
  contact_email: string
  scope_date: string
  scope_version: number | string
  project_name: string
  project_status: string
  project_overview?: string
  deliverables?: string
  tasks_steps?: string
  timelines?: string
  responsibilities?: string
  requirements?: string
  assumptions?: string
  exclusions?: string
  cost?: unknown
  payment_terms_and_conditions?: string
  billing_schedule?: unknown
  scope_id?: string
}

function toInsertValues(body: ScopeOfWorkWritable) {
  let billingSchedule = body.billing_schedule ?? null
  if (typeof billingSchedule === "string" && billingSchedule.trim()) {
    try {
      billingSchedule = JSON.parse(billingSchedule)
    } catch {
      // keep string
    }
  }
  const scopeVersion = Number(body.scope_version)
  return {
    clientName: body.client_name,
    contactName: body.contact_name,
    contactEmail: body.contact_email,
    scopeDate: body.scope_date,
    scopeVersion: Number.isFinite(scopeVersion) ? scopeVersion : null,
    projectName: body.project_name,
    projectStatus: body.project_status,
    projectOverview: body.project_overview || "",
    deliverables: body.deliverables || "",
    tasksSteps: body.tasks_steps || "",
    timelines: body.timelines || "",
    responsibilities: body.responsibilities || "",
    requirements: body.requirements || "",
    assumptions: body.assumptions || "",
    exclusions: body.exclusions || "",
    cost: body.cost ?? [],
    paymentTermsAndConditions: body.payment_terms_and_conditions || "",
    billingSchedule,
    scopeId: body.scope_id || "",
  }
}

export async function fetchScopeOfWorkByIdFromPostgres(
  id: number
): Promise<Record<string, unknown> | null> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(schema.scopeOfWork)
    .where(eq(schema.scopeOfWork.id, id))
    .limit(1)
  if (!row) return null
  return mapScopeOfWorkFromPostgres(row as Record<string, unknown>)
}

export async function createScopeOfWork(
  body: ScopeOfWorkWritable
): Promise<Record<string, unknown>> {
  const db = getDb()
  const [row] = await db
    .insert(schema.scopeOfWork)
    .values(toInsertValues(body))
    .returning()
  if (!row) throw new Error("scope_of_work insert returned no row")
  return mapScopeOfWorkFromPostgres(row as Record<string, unknown>)
}

export async function updateScopeOfWork(
  id: number,
  body: ScopeOfWorkWritable
): Promise<Record<string, unknown>> {
  const db = getDb()
  const [row] = await db
    .update(schema.scopeOfWork)
    .set(toInsertValues(body))
    .where(eq(schema.scopeOfWork.id, id))
    .returning()
  if (!row) throw new Error(`scope_of_work id=${id} not found`)
  return mapScopeOfWorkFromPostgres(row as Record<string, unknown>)
}
