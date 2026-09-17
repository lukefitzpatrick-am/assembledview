import { desc, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { ScenarioLevers, ScenarioResult } from "./types.js"
import type { SavedScenario, SavedScenarioInsert } from "./savedScenarios.js"

export class SavedScenarioError extends Error {
  readonly code: "UNAVAILABLE" | "VALIDATION"
  constructor(code: SavedScenarioError["code"], message: string) {
    super(message)
    this.name = "SavedScenarioError"
    this.code = code
  }
}

function isMissingTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /pacing_scenarios|42703|42P01/i.test(message)
}

function asLevers(value: unknown): ScenarioLevers {
  const raw = value && typeof value === "object" ? (value as ScenarioLevers) : null
  return {
    moves: Array.isArray(raw?.moves) ? raw.moves : [],
    caps: Array.isArray(raw?.caps) ? raw.caps : [],
    pauses: Array.isArray(raw?.pauses) ? raw.pauses : [],
    extendDays: Number(raw?.extendDays) || 0,
    burstDateChanges: Array.isArray(raw?.burstDateChanges) ? raw.burstDateChanges : [],
  }
}

function asResult(value: unknown): ScenarioResult {
  return value as ScenarioResult
}

function mapRow(row: {
  id: number
  mbaNumber: string
  versionNumber: number
  name: string
  levers: unknown
  result: unknown
  createdByEmail: string
  createdAt: string
}): SavedScenario {
  return {
    id: Number(row.id),
    mbaNumber: row.mbaNumber,
    versionNumber: Number(row.versionNumber),
    name: row.name,
    levers: asLevers(row.levers),
    result: asResult(row.result),
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
  }
}

export async function listSavedScenarios(mbaNumber: string): Promise<SavedScenario[]> {
  const mba = mbaNumber.trim().toLowerCase()
  if (!mba) return []
  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(schema.pacingScenarios)
      .where(sql`lower(${schema.pacingScenarios.mbaNumber}) = ${mba}`)
      .orderBy(desc(schema.pacingScenarios.createdAt))
    return rows.map(mapRow)
  } catch (err) {
    if (isMissingTable(err)) {
      throw new SavedScenarioError(
        "UNAVAILABLE",
        "pacing_scenarios is not applied yet",
      )
    }
    throw err
  }
}

export async function insertSavedScenario(row: SavedScenarioInsert): Promise<SavedScenario> {
  const name = row.name.trim()
  if (!name) {
    throw new SavedScenarioError("VALIDATION", "name is required")
  }
  try {
    const db = getDb()
    const inserted = await db
      .insert(schema.pacingScenarios)
      .values({
        mbaNumber: row.mbaNumber.trim(),
        versionNumber: row.versionNumber,
        name,
        levers: row.levers,
        result: row.result,
        createdByEmail: row.createdByEmail.trim().toLowerCase(),
      })
      .returning()
    const first = inserted[0]
    if (!first) {
      throw new SavedScenarioError("UNAVAILABLE", "insert returned no row")
    }
    return mapRow(first)
  } catch (err) {
    if (err instanceof SavedScenarioError) throw err
    if (isMissingTable(err)) {
      throw new SavedScenarioError(
        "UNAVAILABLE",
        "pacing_scenarios is not applied yet",
      )
    }
    throw err
  }
}
