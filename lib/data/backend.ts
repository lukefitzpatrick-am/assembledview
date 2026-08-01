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
 * Intentionally does NOT fall back to global `DATA_BACKEND` — default `xano`
 * stays inert even when other domains are on postgres (C-22 soak gate).
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
 * MBA combined-detail GET backend. Env `DATA_BACKEND_PLAN_DETAIL` only
 * (`xano` | `postgres`). Default `xano` — flipping is Luke's post-verify step.
 */
export function getPlanDetailBackend(): PlanDetailBackend {
  const v = (process.env.DATA_BACKEND_PLAN_DETAIL ?? "xano").trim().toLowerCase()
  return v === "postgres" ? "postgres" : "xano"
}
