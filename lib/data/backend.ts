/**
 * Phase 2 data-backend switch for shadow-read cutover.
 * Default remains Xano until a domain is flipped to `postgres`.
 *
 * Per-domain override: `DATA_BACKEND_<DOMAIN>` (e.g. `DATA_BACKEND_PUBLISHERS`)
 * falls back to global `DATA_BACKEND`, then `xano`.
 *
 * Write path (T4a+): `WRITE_BACKEND` is independent of reads. Default `xano`
 * keeps the editor on the legacy fan-out; `postgres` enables
 * `POST /api/plans/save` → `savePlanVersion`. Create/edit layouts inject the
 * value via `WriteBackendProvider` (T4c).
 *
 * Plan-save Xano mirror (T4b): `XANO_MIRROR_ENABLED`. Default off — only
 * exactly `true` (trimmed, lowercased) enables `mirrorPlanToXano` after
 * Postgres commit. Independent of DATA_BACKEND / WRITE_BACKEND. Post-cutover
 * MBAs have no Xano master row, so the mirror cannot serve as a rollback target.
 */
export type DataBackend = "xano" | "shadow" | "postgres"

export type WriteBackend = "xano" | "postgres"

export type DataBackendDomain =
  | "reference"
  | "publishers"
  | "clients"
  | "kpi"
  | "finance"
  | "pacing"
  | "plans"
  | "approvals"

/**
 * MBA GET detail route (`/api/mediaplans/mba/[mba_number]`) only.
 * Intentionally does NOT fall back to global `DATA_BACKEND`.
 * Default `postgres` (X2 / C-22 closeout). `xano` remains a parsable value
 * but the route returns 410 — postgres is the only implemented branch.
 */
export type PlanDetailBackend = "xano" | "postgres"

function parseDataBackend(raw: string | undefined): DataBackend {
  const v = (raw ?? "xano").trim().toLowerCase()
  if (v === "shadow" || v === "postgres") return v
  return "xano"
}

/** Global `DATA_BACKEND` (default `xano`). */
export function getDataBackend(): DataBackend {
  return parseDataBackend(process.env.DATA_BACKEND)
}

/**
 * Domain-scoped backend. Env `DATA_BACKEND_<DOMAIN>` (uppercased) overrides
 * global `DATA_BACKEND` when set to a non-empty value.
 */
export function getDataBackendFor(domain: DataBackendDomain | string): DataBackend {
  const key = `DATA_BACKEND_${String(domain).trim().toUpperCase()}`
  const specific = process.env[key]
  if (specific != null && specific.trim() !== "") {
    return parseDataBackend(specific)
  }
  return getDataBackend()
}

/** Plan write sink. Default `xano` — no user-facing change until flipped. */
export function getWriteBackend(): WriteBackend {
  const v = (process.env.WRITE_BACKEND ?? "xano").trim().toLowerCase()
  return v === "postgres" ? "postgres" : "xano"
}

/**
 * Plan-save Xano write-back after Postgres commit. Default off.
 * Returns true only when `XANO_MIRROR_ENABLED` trims/lowercases to exactly `true`.
 */
export function isXanoMirrorEnabled(): boolean {
  return (process.env.XANO_MIRROR_ENABLED ?? "").trim().toLowerCase() === "true"
}

/**
 * MBA combined-detail GET backend. Env `DATA_BACKEND_PLAN_DETAIL` only
 * (`xano` | `postgres`). Default `postgres` (X2). Setting `xano` is rejected
 * at the MBA route with 410 — do not reintroduce the fan-out.
 */
export function getPlanDetailBackend(): PlanDetailBackend {
  const v = (process.env.DATA_BACKEND_PLAN_DETAIL ?? "postgres").trim().toLowerCase()
  return v === "xano" ? "xano" : "postgres"
}
