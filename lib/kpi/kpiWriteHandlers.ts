/**
 * Admin KPI write handlers (auth already cleared by route).
 * Validation → named 400; upstream Xano miss → named 502; never opaque 500 for bad input.
 */

import type { ZodError, ZodTypeAny } from "zod"
import {
  campaignKpiCreateBodySchema,
  campaignKpiPatchBodySchema,
  clientKpiCreateBodySchema,
  clientKpiPatchBodySchema,
  publisherKpiCreateBodySchema,
  publisherKpiPatchBodySchema,
  type CampaignKPI,
  type CampaignKpiInput,
  type ClientKpi,
  type ClientKpiInput,
  type PublisherKpi,
  type PublisherKpiInput,
} from "./types"

export const KPI_ERROR = {
  INVALID_JSON: "KPI_INVALID_JSON",
  INVALID_ID: "KPI_INVALID_ID",
  VALIDATION_FAILED: "KPI_VALIDATION_FAILED",
  UPSTREAM_FAILED: "KPI_UPSTREAM_FAILED",
  INTERNAL: "KPI_INTERNAL_ERROR",
} as const

export type KpiErrorCode = (typeof KPI_ERROR)[keyof typeof KPI_ERROR]

export type KpiHandlerResult = {
  status: number
  body: unknown
}

function validationFailed(error: ZodError): KpiHandlerResult {
  const msg =
    error.issues.map((i) => i.message).join("; ") || "Validation failed"
  return {
    status: 400,
    body: { error: msg, code: KPI_ERROR.VALIDATION_FAILED },
  }
}

function upstreamFailed(message: string): KpiHandlerResult {
  return {
    status: 502,
    body: { error: message, code: KPI_ERROR.UPSTREAM_FAILED },
  }
}

function internalFailed(message = "Internal server error"): KpiHandlerResult {
  return {
    status: 500,
    body: { error: message, code: KPI_ERROR.INTERNAL },
  }
}

/** Parse a JSON request body string. Bad JSON → 400. */
export function parseKpiJsonBody(
  raw: string,
): KpiHandlerResult | { ok: true; data: unknown } {
  try {
    return { ok: true, data: JSON.parse(raw) as unknown }
  } catch {
    return {
      status: 400,
      body: {
        error: "Request body must be valid JSON",
        code: KPI_ERROR.INVALID_JSON,
      },
    }
  }
}

/** `request.json()` throw → named 400 (never opaque 500). */
export async function readKpiJsonRequest(
  request: Request,
): Promise<KpiHandlerResult | { ok: true; data: unknown }> {
  try {
    return { ok: true, data: await request.json() }
  } catch {
    return {
      status: 400,
      body: {
        error: "Request body must be valid JSON",
        code: KPI_ERROR.INVALID_JSON,
      },
    }
  }
}

/** DELETE ?id= — missing/non-positive → named 400. */
export function parseKpiIdParam(
  raw: string | null | undefined,
): KpiHandlerResult | { ok: true; id: number } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return {
      status: 400,
      body: { error: "id is required", code: KPI_ERROR.INVALID_ID },
    }
  }
  const id = Number(String(raw).trim())
  if (!Number.isInteger(id) || id <= 0) {
    return {
      status: 400,
      body: {
        error: "id must be a positive integer",
        code: KPI_ERROR.INVALID_ID,
      },
    }
  }
  return { ok: true, id }
}

function parseWithSchema<T>(
  schema: ZodTypeAny,
  data: unknown,
): { ok: true; data: T } | KpiHandlerResult {
  const parsed = schema.safeParse(data)
  if (!parsed.success) return validationFailed(parsed.error)
  return { ok: true, data: parsed.data as T }
}

function isUpstreamThrow(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const m = error.message
  return (
    m.startsWith("createCampaignKpis:") ||
    m.startsWith("syncCampaignKpis:") ||
    m.includes("returned null") ||
    m.includes("ECONNREFUSED") ||
    m.includes("timeout") ||
    m.includes("status code")
  )
}

export function mapKpiWriteCatch(error: unknown): KpiHandlerResult {
  if (isUpstreamThrow(error)) {
    return upstreamFailed(
      error instanceof Error ? error.message : "Upstream KPI write failed",
    )
  }
  return internalFailed(
    error instanceof Error ? error.message : "Internal server error",
  )
}

// --- Publisher ---

export type PublisherKpiWriteDeps = {
  create: (input: PublisherKpiInput) => Promise<PublisherKpi | null>
  update: (
    id: number,
    input: Partial<PublisherKpiInput>,
  ) => Promise<PublisherKpi | null>
  delete: (id: number) => Promise<boolean>
}

export async function handlePublisherKpiPost(
  body: unknown,
  deps: Pick<PublisherKpiWriteDeps, "create">,
): Promise<KpiHandlerResult> {
  const parsed = parseWithSchema<PublisherKpiInput>(
    publisherKpiCreateBodySchema,
    body,
  )
  if (!("ok" in parsed)) return parsed
  const result = await deps.create(parsed.data)
  if (result === null) {
    return upstreamFailed("Failed to create publisher KPI")
  }
  return { status: 201, body: result }
}

export async function handlePublisherKpiPatch(
  body: unknown,
  deps: Pick<PublisherKpiWriteDeps, "update">,
): Promise<KpiHandlerResult> {
  const parsed = parseWithSchema<{ id: number } & Partial<PublisherKpiInput>>(
    publisherKpiPatchBodySchema,
    body,
  )
  if (!("ok" in parsed)) return parsed
  const { id, ...rest } = parsed.data
  const result = await deps.update(id, rest)
  if (result === null) {
    return upstreamFailed("Failed to update publisher KPI")
  }
  return { status: 200, body: result }
}

export async function handlePublisherKpiDelete(
  idRaw: string | null | undefined,
  deps: Pick<PublisherKpiWriteDeps, "delete">,
): Promise<KpiHandlerResult> {
  const idParsed = parseKpiIdParam(idRaw)
  if (!("ok" in idParsed)) return idParsed
  const ok = await deps.delete(idParsed.id)
  if (!ok) return upstreamFailed("Failed to delete publisher KPI")
  return { status: 200, body: { success: true } }
}

// --- Client ---

export type ClientKpiWriteDeps = {
  create: (input: ClientKpiInput) => Promise<ClientKpi | null>
  update: (
    id: number,
    input: Partial<ClientKpiInput>,
  ) => Promise<ClientKpi | null>
  delete: (id: number) => Promise<boolean>
}

export async function handleClientKpiPost(
  body: unknown,
  deps: Pick<ClientKpiWriteDeps, "create">,
): Promise<KpiHandlerResult> {
  const parsed = parseWithSchema<ClientKpiInput>(clientKpiCreateBodySchema, body)
  if (!("ok" in parsed)) return parsed
  const result = await deps.create(parsed.data)
  if (result === null) {
    return upstreamFailed("Failed to create client KPI")
  }
  return { status: 201, body: result }
}

export async function handleClientKpiPatch(
  body: unknown,
  deps: Pick<ClientKpiWriteDeps, "update">,
): Promise<KpiHandlerResult> {
  const parsed = parseWithSchema<{ id: number } & Partial<ClientKpiInput>>(
    clientKpiPatchBodySchema,
    body,
  )
  if (!("ok" in parsed)) return parsed
  const { id, ...rest } = parsed.data
  const result = await deps.update(id, rest)
  if (result === null) {
    return upstreamFailed("Failed to update client KPI")
  }
  return { status: 200, body: result }
}

export async function handleClientKpiDelete(
  idRaw: string | null | undefined,
  deps: Pick<ClientKpiWriteDeps, "delete">,
): Promise<KpiHandlerResult> {
  const idParsed = parseKpiIdParam(idRaw)
  if (!("ok" in idParsed)) return idParsed
  const ok = await deps.delete(idParsed.id)
  if (!ok) return upstreamFailed("Failed to delete client KPI")
  return { status: 200, body: { success: true } }
}

// --- Campaign ---

export type CampaignKpiWriteDeps = {
  create: (inputs: CampaignKpiInput[]) => Promise<CampaignKPI[]>
  update: (
    id: number,
    input: Partial<CampaignKpiInput>,
  ) => Promise<CampaignKPI | null>
  delete: (id: number) => Promise<boolean>
  sync: (inputs: CampaignKpiInput[]) => Promise<CampaignKPI[]>
}

export async function handleCampaignKpiPost(
  body: unknown,
  deps: Pick<CampaignKpiWriteDeps, "create">,
): Promise<KpiHandlerResult> {
  const parsed = parseWithSchema<CampaignKpiInput[]>(
    campaignKpiCreateBodySchema,
    body,
  )
  if (!("ok" in parsed)) return parsed
  try {
    const results = await deps.create(parsed.data)
    return { status: 201, body: results }
  } catch (error) {
    return mapKpiWriteCatch(error)
  }
}

export async function handleCampaignKpiPatch(
  body: unknown,
  deps: Pick<CampaignKpiWriteDeps, "update">,
): Promise<KpiHandlerResult> {
  const parsed = parseWithSchema<{ id: number } & Partial<CampaignKpiInput>>(
    campaignKpiPatchBodySchema,
    body,
  )
  if (!("ok" in parsed)) return parsed
  const { id, ...rest } = parsed.data
  const result = await deps.update(id, rest)
  if (result === null) {
    return upstreamFailed("Failed to update campaign KPI")
  }
  return { status: 200, body: result }
}

export async function handleCampaignKpiDelete(
  idRaw: string | null | undefined,
  deps: Pick<CampaignKpiWriteDeps, "delete">,
): Promise<KpiHandlerResult> {
  const idParsed = parseKpiIdParam(idRaw)
  if (!("ok" in idParsed)) return idParsed
  const ok = await deps.delete(idParsed.id)
  if (!ok) return upstreamFailed("Failed to delete campaign KPI")
  return { status: 200, body: { success: true } }
}

export async function handleCampaignKpiSync(
  body: unknown,
  deps: Pick<CampaignKpiWriteDeps, "sync">,
): Promise<KpiHandlerResult> {
  const parsed = parseWithSchema<CampaignKpiInput[]>(
    campaignKpiCreateBodySchema,
    body,
  )
  if (!("ok" in parsed)) return parsed
  try {
    const results = await deps.sync(parsed.data)
    return { status: 200, body: results }
  } catch (error) {
    return mapKpiWriteCatch(error)
  }
}
