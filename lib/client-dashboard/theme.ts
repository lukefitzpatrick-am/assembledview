import { AV_HOUSE_PALETTE } from "./palette"

const DEFAULT_PRIMARY = "#1A2B78"
const BLACK = "#000000"
const WHITE = "#FFFFFF"

/** Mix toward `b`: `(1 - t) * a + t * b` per channel, `t` in [0, 1]. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseRgb(a)
  const pb = parseRgb(b)
  if (!pa || !pb) {
    const fb = parseRgb(DEFAULT_PRIMARY)
    return fb ? toHex(fb.r, fb.g, fb.b) : DEFAULT_PRIMARY
  }
  const u = clamp01(t)
  return toHex(
    (1 - u) * pa.r + u * pb.r,
    (1 - u) * pa.g + u * pb.g,
    (1 - u) * pa.b + u * pb.b,
  )
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "")
  if (raw.length === 3) {
    const r = parseInt(raw.slice(0, 1) + raw.slice(0, 1), 16)
    const g = parseInt(raw.slice(1, 2) + raw.slice(1, 2), 16)
    const b = parseInt(raw.slice(2, 3) + raw.slice(2, 3), 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return { r, g, b }
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16)
    const g = parseInt(raw.slice(2, 4), 16)
    const b = parseInt(raw.slice(4, 6), 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return { r, g, b }
  }
  return null
}

function toHex(r: number, g: number, b: number): string {
  const clampChannel = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const rr = clampChannel(r).toString(16).padStart(2, "0")
  const gg = clampChannel(g).toString(16).padStart(2, "0")
  const bb = clampChannel(b).toString(16).padStart(2, "0")
  return `#${rr}${gg}${bb}`
}

function normalizeHexKey(hex: string): string {
  return hex.trim().replace(/^#/, "").toLowerCase()
}

function isValidHex(hex: string | null | undefined): hex is string {
  if (hex == null) return false
  const key = normalizeHexKey(hex)
  return key.length === 3 || key.length === 6
}

function pickHex(value: string | null | undefined, fallback: string): string {
  if (!isValidHex(value)) {
    const fb = parseRgb(fallback)
    return fb ? toHex(fb.r, fb.g, fb.b) : DEFAULT_PRIMARY
  }
  const parsed = parseRgb(value)
  if (!parsed) {
    const fb = parseRgb(fallback)
    return fb ? toHex(fb.r, fb.g, fb.b) : DEFAULT_PRIMARY
  }
  return toHex(parsed.r, parsed.g, parsed.b)
}

export type ClientBrandTheme = {
  primary: string
  primaryDark: string
  primaryTint: string
  name: string
  subName?: string
  logoUrl?: string
}

/**
 * Minimal client payload (snake_case to mirror planned Xano fields).
 * Unknown keys are ignored by `buildClientTheme`.
 */
export type ClientDashboardBrandInput = {
  name?: string | null
  sub_name?: string | null
  dashboard_logo_url?: string | null
  brand_primary_hex?: string | null
  brand_primary_dark_hex?: string | null
  brand_primary_tint_hex?: string | null
}

function pickOptionalString(value: string | null | undefined): string | undefined {
  if (value == null) return undefined
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

function derivePrimaryTint(primary: string): string {
  return mixHex(primary, WHITE, 0.92)
}

function derivePrimaryDark(primary: string): string {
  return mixHex(primary, BLACK, 0.45)
}

export function buildClientTheme(client: ClientDashboardBrandInput | null | undefined): ClientBrandTheme {
  const primary = pickHex(client?.brand_primary_hex, DEFAULT_PRIMARY)
  const primaryDark = isValidHex(client?.brand_primary_dark_hex)
    ? pickHex(client?.brand_primary_dark_hex, derivePrimaryDark(primary))
    : derivePrimaryDark(primary)
  const primaryTint = isValidHex(client?.brand_primary_tint_hex)
    ? pickHex(client?.brand_primary_tint_hex, derivePrimaryTint(primary))
    : derivePrimaryTint(primary)

  const name = pickOptionalString(client?.name) ?? ""
  const subName = pickOptionalString(client?.sub_name)
  const logoUrl = pickOptionalString(client?.dashboard_logo_url)

  return {
    primary,
    primaryDark,
    primaryTint,
    name,
    ...(subName !== undefined ? { subName } : {}),
    ...(logoUrl !== undefined ? { logoUrl } : {}),
  }
}

export function getChartPalette(theme: ClientBrandTheme): string[] {
  const ordered = [theme.primary, ...AV_HOUSE_PALETTE]
  const seen = new Set<string>()
  const out: string[] = []
  for (const hex of ordered) {
    const key = normalizeHexKey(hex)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(hex)
  }
  return out
}
