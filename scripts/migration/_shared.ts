/**
 * Shared helpers for Xano → Supabase migration scripts.
 */
import fs from "fs"
import path from "path"
import {
  findClientRawByDashboardSlug,
  dashboardSlugKeyFromSegment,
} from "@/lib/clients/xanoClientSlugMatch"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"

export type JsonlRow = Record<string, unknown>

export function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

export function newestSnapshotDir(root = path.resolve(process.cwd(), "exports/xano")): string {
  if (!fs.existsSync(root)) {
    throw new Error(`No exports directory at ${root} — run npm run xano:export first`)
  }
  const dates = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort()
  if (dates.length === 0) {
    throw new Error(`No dated snapshot folders under ${root}`)
  }
  const newest = dates[dates.length - 1]
  const dir = path.join(root, newest)
  if (!fs.existsSync(path.join(dir, "manifest.json"))) {
    throw new Error(`Snapshot ${dir} missing manifest.json`)
  }
  return dir
}

export function readJsonl(filePath: string): JsonlRow[] {
  if (!fs.existsSync(filePath)) return []
  const text = fs.readFileSync(filePath, "utf8")
  const rows: JsonlRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    rows.push(JSON.parse(t) as JsonlRow)
  }
  return rows
}

export function readManifest(snapshotDir: string): {
  exported_at: string
  table_count: number
  tables: Array<{ name: string; fetched_count: number; file: string; ok: boolean }>
} {
  return JSON.parse(fs.readFileSync(path.join(snapshotDir, "manifest.json"), "utf8"))
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function writeCsv(
  filePath: string,
  headers: string[],
  rows: Array<Record<string, unknown>>
): void {
  ensureDir(path.dirname(filePath))
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","))
  }
  fs.writeFileSync(filePath, lines.join("\n") + (lines.length > 1 ? "\n" : ""), "utf8")
}

/** Banker's round (half to even) then scale to integer cents. */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new Error(`toCents: non-finite ${dollars}`)
  }
  const scaled = dollars * 100
  const floored = Math.floor(scaled)
  const diff = scaled - floored
  if (diff > 0.5) return floored + 1
  if (diff < 0.5) return floored
  // exactly .5 → nearest even
  return floored % 2 === 0 ? floored : floored + 1
}

/**
 * Parse money for migration. Returns null if unparseable — never guess zero
 * for non-empty garbage (zeros are only for explicit 0 / "$0.00" / empty).
 */
export function parseMoneyStrict(val: unknown): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : null
  }
  const raw = String(val).trim()
  if (!raw) return null
  const cleaned = raw.replace(/[$,\s]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === ".") return null
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Soft parse for recon burst sums — empty → 0, garbage → null (caller decides). */
export function parseMoneyOrZero(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0
  const n = parseMoneyStrict(val)
  return n == null ? 0 : n
}

export function tsFromXano(val: unknown): string | null {
  if (val == null || val === "") return null
  if (typeof val === "number" && Number.isFinite(val)) {
    // Xano timestamps are ms since epoch
    return new Date(val).toISOString()
  }
  if (typeof val === "string") {
    const t = val.trim()
    if (!t) return null
    if (/^\d+$/.test(t)) return new Date(Number(t)).toISOString()
    const d = new Date(t)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

export function asText(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "string") return val
  if (typeof val === "number" || typeof val === "boolean") return String(val)
  return JSON.stringify(val)
}

export function asBool(val: unknown): boolean | null {
  if (val == null || val === "") return null
  if (typeof val === "boolean") return val
  if (typeof val === "number") return val !== 0
  if (typeof val === "string") {
    const t = val.trim().toLowerCase()
    if (t === "true" || t === "1") return true
    if (t === "false" || t === "0") return false
  }
  return null
}

export function asInt(val: unknown): number | null {
  if (val == null || val === "") return null
  if (typeof val === "number" && Number.isFinite(val)) return Math.trunc(val)
  const n = Number.parseInt(String(val).trim(), 10)
  return Number.isFinite(n) ? n : null
}

export function asNumericString(val: unknown): string | null {
  if (val == null || val === "") return null
  if (typeof val === "number" && Number.isFinite(val)) return String(val)
  const s = String(val).trim()
  return s.length ? s : null
}

function findClientByMbaidentifierSlug(
  rows: unknown[],
  targetKey: string
): Record<string, unknown> | null {
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const mba = String(r.mbaidentifier ?? "").trim()
    if (!mba) continue
    if (slugifyClientNameForUrl(mba) === targetKey) return r
  }
  return null
}

/**
 * Resolve client_id from a display name using the app's dashboard-slug match,
 * falling back to mbaidentifier-slug (same order as resolveClientGroup).
 */
export function resolveClientId(
  name: string | null | undefined,
  clients: JsonlRow[]
): number | null {
  const display = String(name ?? "").trim()
  if (!display) return null
  const key = dashboardSlugKeyFromSegment(display)
  if (!key) return null
  const hit =
    findClientRawByDashboardSlug(clients, key) ??
    findClientByMbaidentifierSlug(clients, key)
  if (!hit) return null
  const id = asInt(hit.id)
  return id
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function reconOutDir(snapshotDir: string): string {
  return path.join(snapshotDir, "recon")
}
