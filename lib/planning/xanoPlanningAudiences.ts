import "server-only"

import axios, { AxiosError } from "axios"
import { parseXanoListPayload, requireXanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type {
  PlanningAudienceRow,
  PlanningAudienceWritable,
} from "./audienceTypes"

export type { PlanningAudienceRow, PlanningAudienceWritable } from "./audienceTypes"

const PLANNING_AUDIENCES_PATH = "planning_audiences"
const XANO_TIMEOUT_MS = 15_000

export class XanoPlanningAudienceError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "XanoPlanningAudienceError"
    this.status = status
  }
}

function authHeaders(): Record<string, string> {
  try {
    return {
      ...requireXanoAuthHeaderRecord(),
      "Content-Type": "application/json",
    }
  } catch {
    throw new XanoPlanningAudienceError("Missing XANO_API_KEY", 500)
  }
}

function mapAxiosError(error: unknown, context: string): never {
  if (error instanceof XanoPlanningAudienceError) {
    throw error
  }
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError
    const status = ax.response?.status ?? 502
    const detail =
      typeof ax.response?.data === "object" && ax.response.data !== null
        ? JSON.stringify(ax.response.data)
        : ax.message
    console.error(`[planning-audiences] ${context}`, status, detail)
    throw new XanoPlanningAudienceError(`${context} failed (${status})`, status)
  }
  console.error(`[planning-audiences] ${context}`, error)
  throw new XanoPlanningAudienceError(`${context} failed`, 502)
}

function asRow(row: unknown): PlanningAudienceRow {
  return row as PlanningAudienceRow
}

function parseList(data: unknown): PlanningAudienceRow[] {
  const list = Array.isArray(data) ? data : parseXanoListPayload(data)
  return list.map(asRow)
}

export async function listPlanningAudiences(opts?: {
  clientsId?: number
}): Promise<PlanningAudienceRow[]> {
  try {
    const base = xanoUrl(PLANNING_AUDIENCES_PATH, "XANO_CLIENTS_BASE_URL")
    const url =
      opts?.clientsId != null
        ? `${base}?clients_id=${encodeURIComponent(String(opts.clientsId))}`
        : base
    const response = await axios.get(url, {
      headers: authHeaders(),
      timeout: XANO_TIMEOUT_MS,
    })
    const rows = parseList(response.data)
    if (opts?.clientsId == null) return rows
    return rows.filter((row) => Number(row.clients_id) === opts.clientsId)
  } catch (error) {
    mapAxiosError(error, "listPlanningAudiences")
  }
}

export async function createPlanningAudience(
  body: PlanningAudienceWritable
): Promise<PlanningAudienceRow> {
  try {
    const response = await axios.post(
      xanoUrl(PLANNING_AUDIENCES_PATH, "XANO_CLIENTS_BASE_URL"),
      {
        ...body,
        client_visible: body.client_visible ?? false,
      },
      {
        headers: authHeaders(),
        timeout: XANO_TIMEOUT_MS,
      }
    )
    return asRow(response.data)
  } catch (error) {
    mapAxiosError(error, "createPlanningAudience")
  }
}

export async function getPlanningAudience(id: number): Promise<PlanningAudienceRow> {
  try {
    const response = await axios.get(
      `${xanoUrl(PLANNING_AUDIENCES_PATH, "XANO_CLIENTS_BASE_URL")}/${encodeURIComponent(String(id))}`,
      {
        headers: authHeaders(),
        timeout: XANO_TIMEOUT_MS,
      }
    )
    return asRow(response.data)
  } catch (error) {
    mapAxiosError(error, "getPlanningAudience")
  }
}

export async function updatePlanningAudience(
  id: number,
  patch: {
    mba_number?: string | null
    client_visible?: boolean
    name?: string
  }
): Promise<PlanningAudienceRow> {
  try {
    const response = await axios.patch(
      `${xanoUrl(PLANNING_AUDIENCES_PATH, "XANO_CLIENTS_BASE_URL")}/${encodeURIComponent(String(id))}`,
      patch,
      {
        headers: authHeaders(),
        timeout: XANO_TIMEOUT_MS,
      }
    )
    return asRow(response.data)
  } catch (error) {
    mapAxiosError(error, "updatePlanningAudience")
  }
}

export async function listPlanningAudiencesByMba(
  mbaNumber: string
): Promise<PlanningAudienceRow[]> {
  const needle = mbaNumber.trim().toLowerCase()
  if (!needle) return []
  try {
    const base = xanoUrl(PLANNING_AUDIENCES_PATH, "XANO_CLIENTS_BASE_URL")
    // Prefer server-side filter when Xano supports it; always re-filter client-side.
    const url = `${base}?mba_number=${encodeURIComponent(mbaNumber.trim())}`
    const response = await axios.get(url, {
      headers: authHeaders(),
      timeout: XANO_TIMEOUT_MS,
    })
    const rows = parseList(response.data)
    return rows.filter(
      (row) => String(row.mba_number ?? "").trim().toLowerCase() === needle
    )
  } catch (error) {
    // Fallback: list all and filter (small table).
    try {
      const all = await listPlanningAudiences()
      return all.filter(
        (row) => String(row.mba_number ?? "").trim().toLowerCase() === needle
      )
    } catch {
      mapAxiosError(error, "listPlanningAudiencesByMba")
    }
  }
}
