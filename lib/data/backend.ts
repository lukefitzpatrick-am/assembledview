/**
 * Phase 2 data-backend switch. Postgres is the default: an unset or
 * unrecognised variable must not select the retired Xano read/write path.
 *
 * Per-domain override: `DATA_BACKEND_<DOMAIN>` (e.g. `DATA_BACKEND_PUBLISHERS`)
 * falls back to global `DATA_BACKEND`, then `postgres`. `xano` remains a legal
 * explicit value (ETL / shadow-diff tooling) and warns once per process.
 *
 * Write path (T4a+): `WRITE_BACKEND` is independent of reads. Default
 * `postgres` enables `POST /api/plans/save` → `savePlanVersion`. Create/edit
 * layouts inject the value via `WriteBackendProvider` (T4c). Explicit
 * `WRITE_BACKEND=xano` keeps the legacy fan-out and warns.
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

const xanoWarned = new Set<string>()

function warnIfExplicitXano(domain: string, envKey: string): void {
  const id = `${domain}:${envKey}`
  if (xanoWarned.has(id)) return
  xanoWarned.add(id)
  console.warn(
    `[backend] explicit Xano selected (deprecated default). domain=${domain} env=${envKey}`
  )
}

/** Test-only: clear the once-per-process Xano warn set. */
export function __resetXanoBackendWarnForTests(): void {
  xanoWarned.clear()
}

function parseDataBackend(raw: string | undefined): DataBackend {
  const v = (raw ?? "").trim().toLowerCase()
  if (v === "shadow" || v === "postgres" || v === "xano") return v
  return "postgres"
}

/** Global `DATA_BACKEND` (default `postgres`). Explicit `xano` is legal and warns. */
export function getDataBackend(): DataBackend {
  const resolved = parseDataBackend(process.env.DATA_BACKEND)
  if (resolved === "xano") warnIfExplicitXano("global", "DATA_BACKEND")
  return resolved
}

/**
 * Domain-scoped backend. Env `DATA_BACKEND_<DOMAIN>` (uppercased) overrides
 * global `DATA_BACKEND` when set to a non-empty value. Terminal fallback is
 * `postgres` (not `xano`).
 */
export function getDataBackendFor(domain: DataBackendDomain | string): DataBackend {
  const key = `DATA_BACKEND_${String(domain).trim().toUpperCase()}`
  const specific = process.env[key]
  if (specific != null && specific.trim() !== "") {
    const resolved = parseDataBackend(specific)
    if (resolved === "xano") warnIfExplicitXano(String(domain).trim(), key)
    return resolved
  }
  const resolved = parseDataBackend(process.env.DATA_BACKEND)
  if (resolved === "xano") warnIfExplicitXano(String(domain).trim(), "DATA_BACKEND")
  return resolved
}

/**
 * Plan write sink. Default `postgres` — unset must not select the retired
 * Xano fan-out. Explicit `WRITE_BACKEND=xano` remains legal and warns.
 */
export function getWriteBackend(): WriteBackend {
  const v = (process.env.WRITE_BACKEND ?? "").trim().toLowerCase()
  const resolved: WriteBackend = v === "xano" ? "xano" : "postgres"
  if (resolved === "xano") warnIfExplicitXano("write", "WRITE_BACKEND")
  return resolved
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
