import "server-only"

import { listByMba } from "@/lib/creative/xanoCreativeAssets"
import type { CreativeAsset } from "@/lib/creative/types"

export type UploadDigestGroup = {
  mbaNumber: string
  assets: CreativeAsset[]
}

export type UploadDigestPayload = {
  windowMinutes: number
  sinceIso: string
  builtAt: string
  totalFiles: number
  totalUploaders: number
  groups: UploadDigestGroup[]
}

const WINDOW_MINUTES = Number(process.env.UPLOAD_DIGEST_WINDOW_MIN ?? 65)

/**
 * ⚠️ listByMba() with no argument returns the FULL creative_asset list from Xano
 * (unpaginated). Fine at current volume; if the table grows, add server-side
 * filters to the Xano `creative_asset` GET: created_at_after + uploaded_by_role,
 * and swap this to a filtered fetch.
 */
export async function buildUploadDigest(
  now: Date = new Date(),
): Promise<UploadDigestPayload> {
  const windowMs = WINDOW_MINUTES * 60 * 1000
  const cutoff = now.getTime() - windowMs
  const all = await listByMba() // all rows; filtered below

  const fresh = all.filter(
    (a) =>
      a.uploaded_by_role === "client" &&
      a.status === "active" &&
      typeof a.created_at === "number" &&
      a.created_at >= cutoff,
  )

  const byMba = new Map<string, CreativeAsset[]>()
  for (const a of fresh) {
    const key = String(a.mba_number ?? "").trim() || "(no MBA)"
    const arr = byMba.get(key) ?? []
    arr.push(a)
    byMba.set(key, arr)
  }

  const groups: UploadDigestGroup[] = [...byMba.entries()]
    .map(([mbaNumber, assets]) => ({
      mbaNumber,
      assets: assets.sort((x, y) => y.created_at - x.created_at),
    }))
    .sort((a, b) => a.mbaNumber.localeCompare(b.mbaNumber))

  const uploaders = new Set(
    fresh.map((a) => a.uploaded_by_email).filter(Boolean),
  )

  return {
    windowMinutes: WINDOW_MINUTES,
    sinceIso: new Date(cutoff).toISOString(),
    builtAt: now.toISOString(),
    totalFiles: fresh.length,
    totalUploaders: uploaders.size,
    groups,
  }
}
