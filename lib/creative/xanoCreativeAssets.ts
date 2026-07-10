import "server-only"

import axios, { AxiosError } from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import type { CreativeAsset, CreativeAssetWritable } from "@/lib/creative/types"

const CREATIVE_ASSET_PATH = "creative_asset"
const XANO_TIMEOUT_MS = 15_000

export class XanoCreativeAssetError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "XanoCreativeAssetError"
    this.status = status
  }
}

function authHeaders(): Record<string, string> {
  const apiKey = process.env.XANO_API_KEY
  if (!apiKey) {
    throw new XanoCreativeAssetError("Missing XANO_API_KEY", 500)
  }
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
}

function mapAxiosError(error: unknown, context: string): never {
  if (error instanceof XanoCreativeAssetError) {
    throw error
  }
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError
    const status = ax.response?.status ?? 502
    const detail =
      typeof ax.response?.data === "object" && ax.response.data !== null
        ? JSON.stringify(ax.response.data)
        : ax.message
    console.error(`[creative-assets] ${context}`, status, detail)
    throw new XanoCreativeAssetError(`${context} failed (${status})`, status)
  }
  console.error(`[creative-assets] ${context}`, error)
  throw new XanoCreativeAssetError(`${context} failed`, 502)
}

function asCreativeAsset(row: unknown): CreativeAsset {
  return row as CreativeAsset
}

function parseList(data: unknown): CreativeAsset[] {
  const list = Array.isArray(data) ? data : parseXanoListPayload(data)
  return list.map(asCreativeAsset)
}

export async function listByMba(mbaNumber?: string): Promise<CreativeAsset[]> {
  try {
    const response = await axios.get(xanoUrl(CREATIVE_ASSET_PATH, "XANO_CLIENTS_BASE_URL"), {
      headers: authHeaders(),
      params: mbaNumber ? { mba_number: mbaNumber } : undefined,
      timeout: XANO_TIMEOUT_MS,
    })
    return parseList(response.data)
  } catch (error) {
    mapAxiosError(error, "listByMba")
  }
}

export async function getById(id: number): Promise<CreativeAsset | null> {
  try {
    const response = await axios.get(
      xanoUrl(`${CREATIVE_ASSET_PATH}/${id}`, "XANO_CLIENTS_BASE_URL"),
      {
        headers: authHeaders(),
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (status) => status === 200 || status === 404,
      },
    )
    if (response.status === 404) return null
    return asCreativeAsset(response.data)
  } catch (error) {
    mapAxiosError(error, "getById")
  }
}

export async function findByBlobPathname(
  blobPathname: string,
  mbaNumber?: string,
): Promise<CreativeAsset | null> {
  const rows = await listByMba(mbaNumber)
  return rows.find((row) => row.blob_pathname === blobPathname) ?? null
}

export async function create(body: CreativeAssetWritable): Promise<CreativeAsset> {
  try {
    const response = await axios.post(
      xanoUrl(CREATIVE_ASSET_PATH, "XANO_CLIENTS_BASE_URL"),
      body,
      {
        headers: authHeaders(),
        timeout: XANO_TIMEOUT_MS,
      },
    )
    return asCreativeAsset(response.data)
  } catch (error) {
    mapAxiosError(error, "create")
  }
}

export async function createIdempotent(body: CreativeAssetWritable): Promise<CreativeAsset> {
  const existing = await findByBlobPathname(body.blob_pathname, body.mba_number)
  if (existing) return existing
  return create(body)
}

export async function update(
  id: number,
  body: Partial<CreativeAssetWritable>,
): Promise<CreativeAsset> {
  try {
    const response = await axios.patch(
      xanoUrl(`${CREATIVE_ASSET_PATH}/${id}`, "XANO_CLIENTS_BASE_URL"),
      body,
      {
        headers: authHeaders(),
        timeout: XANO_TIMEOUT_MS,
      },
    )
    return asCreativeAsset(response.data)
  } catch (error) {
    mapAxiosError(error, "update")
  }
}

export async function remove(id: number): Promise<void> {
  try {
    await axios.delete(xanoUrl(`${CREATIVE_ASSET_PATH}/${id}`, "XANO_CLIENTS_BASE_URL"), {
      headers: authHeaders(),
      timeout: XANO_TIMEOUT_MS,
    })
  } catch (error) {
    mapAxiosError(error, "remove")
  }
}
