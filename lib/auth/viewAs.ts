/**
 * View as client (admin only). Edge-safe: Web Crypto only, no Node APIs, no DB.
 *
 * An admin starts a short client view for one client. The start route signs a
 * payload into the `__Host-av_view_as` cookie (HMAC-SHA256, `VIEW_AS_SECRET`).
 * `auth0.getSession` (lib/auth0.ts) then returns a fresh minimal client user
 * built here, so every existing guard, page and API sees a client with
 * `client_slugs = [slug]` and no `mba_numbers` (Mode 1, client level).
 *
 * The overlay applies only when ALL hold:
 * - VIEW_AS_ENABLED is on/1/true and VIEW_AS_SECRET is at least 32 characters
 * - the cookie verifies and has not expired
 * - the raw session user is admin
 * - the raw `sub` equals the cookie's `adminSub`
 * Otherwise the raw session is returned unchanged.
 *
 * The overlay user is built from an allowlist, never copied from the admin:
 * roles exactly ["client"], a fake `.invalid` email (no email allowlist can
 * match), no `permissions`, no `user_metadata`, no `app_metadata.role`.
 * `__viewAs` carries banner and audit facts only; no role code reads it.
 */

import { userHasAdminAccess } from "../rbac"

export const VIEW_AS_COOKIE = "__Host-av_view_as"
/** Non-secret marker that a client view was running (expiry + 12 h). */
export const VIEW_AS_HINT_COOKIE = "av_view_as_hint"
export const VIEW_AS_MINUTES = [30, 60, 120] as const
export type ViewAsMinutes = (typeof VIEW_AS_MINUTES)[number]
export const VIEW_AS_DEFAULT_MINUTES: ViewAsMinutes = 60
export const VIEW_AS_HINT_GRACE_SECONDS = 12 * 60 * 60
export const VIEW_AS_MIN_SECRET_LENGTH = 32
export const VIEW_AS_EMAIL_DOMAIN = "assembledview.invalid"

/** Claim keys the overlay writes. These are the defaults rbac.ts always scans. */
export const VIEW_AS_ROLE_CLAIM = "https://assembledview.com/roles"
export const VIEW_AS_CLIENT_SLUG_CLAIM = "https://assembledview.com/client_slug"
export const VIEW_AS_CLIENT_SLUGS_CLAIM = "https://assembledview.com/client_slugs"

/** POSTs a client page makes that only read, plus the view-as exit and audit routes. */
export const VIEW_AS_WRITE_ALLOWLIST: readonly string[] = [
  "/api/view-as/exit",
  "/api/view-as/audit",
  "/api/pacing/bulk",
  "/api/pacing/conversions",
]

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const ON = new Set(["on", "1", "true"])

export type ViewAsPayload = {
  v: 1
  adminSub: string
  slug: string
  clientId: number | null
  clientName: string
  /** Issued at, seconds since epoch. */
  iat: number
  /** Expires at, seconds since epoch. */
  exp: number
  nonce: string
}

/** What the banner and audit read off the overlay user. */
export type ViewAsMarker = {
  adminSub: string
  slug: string
  clientId: number | null
  clientName: string
  startedAt: number
  exp: number
}

type Env = Record<string, string | undefined>

export function isViewAsEnabled(env: Env = process.env as Env): boolean {
  if (!ON.has((env.VIEW_AS_ENABLED ?? "").trim().toLowerCase())) return false
  return getViewAsSecret(env) != null
}

export function getViewAsSecret(env: Env = process.env as Env): string | null {
  const secret = env.VIEW_AS_SECRET ?? ""
  return secret.length >= VIEW_AS_MIN_SECRET_LENGTH ? secret : null
}

export function normaliseViewAsMinutes(value: unknown): ViewAsMinutes {
  const n = typeof value === "number" ? value : Number(value)
  return (VIEW_AS_MINUTES as readonly number[]).includes(n) ? (n as ViewAsMinutes) : VIEW_AS_DEFAULT_MINUTES
}

/** Lower-case slug with only the characters tenant slugs use. Empty when unusable. */
export function normaliseViewAsSlug(value: unknown): string {
  const slug = String(value ?? "").trim().toLowerCase()
  if (!slug || slug.length > 120 || /^\d+$/.test(slug)) return ""
  return /^[a-z0-9][a-z0-9_-]*$/.test(slug) ? slug : ""
}

// ── base64url without Buffer (edge) ────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)
    const binary = atob(padded)
    const out = new Uint8Array(new ArrayBuffer(binary.length))
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])
}

function randomNonce(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export function buildViewAsPayload(input: {
  adminSub: string
  slug: string
  clientId: number | null
  clientName: string
  minutes: ViewAsMinutes
  nowMs: number
  nonce?: string
}): ViewAsPayload {
  const iat = Math.floor(input.nowMs / 1000)
  return {
    v: 1,
    adminSub: input.adminSub,
    slug: input.slug,
    clientId: input.clientId,
    clientName: input.clientName,
    iat,
    exp: iat + input.minutes * 60,
    nonce: input.nonce ?? randomNonce(),
  }
}

export async function signViewAsPayload(payload: ViewAsPayload, secret: string): Promise<string> {
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)))
  return `${body}.${bytesToBase64Url(sig)}`
}

function isPayload(value: unknown): value is ViewAsPayload {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    v.v === 1 &&
    typeof v.adminSub === "string" &&
    v.adminSub.length > 0 &&
    typeof v.slug === "string" &&
    normaliseViewAsSlug(v.slug) === v.slug &&
    (v.clientId === null || (typeof v.clientId === "number" && Number.isFinite(v.clientId))) &&
    typeof v.clientName === "string" &&
    typeof v.iat === "number" &&
    typeof v.exp === "number" &&
    v.exp > v.iat &&
    typeof v.nonce === "string"
  )
}

export type ViewAsVerifyResult =
  | { ok: true; payload: ViewAsPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" }

/**
 * Verifies the HMAC (constant time via Web Crypto) and the expiry.
 * `allowExpired` is for the exit route only, so it can name the client in the audit row.
 */
export async function verifyViewAsToken(
  token: string | null | undefined,
  secret: string,
  nowMs: number,
  options: { allowExpired?: boolean } = {},
): Promise<ViewAsVerifyResult> {
  if (!token || token.length > 4096) return { ok: false, reason: "malformed" }
  const parts = token.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" }
  const sig = base64UrlToBytes(parts[1])
  const bodyBytes = base64UrlToBytes(parts[0])
  if (!sig || !bodyBytes) return { ok: false, reason: "malformed" }
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(parts[0]))
  if (!valid) return { ok: false, reason: "bad_signature" }
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(bodyBytes))
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (!isPayload(parsed)) return { ok: false, reason: "malformed" }
  if (!options.allowExpired && parsed.exp * 1000 <= nowMs) return { ok: false, reason: "expired" }
  return { ok: true, payload: parsed }
}

function syntheticEmail(slug: string): string {
  return `view-as+${slug.replace(/[^a-z0-9_-]/g, "")}@${VIEW_AS_EMAIL_DOMAIN}`
}

/** A fresh client user. Nothing is copied from the admin except `sub`. */
export function buildViewAsUser(
  rawUser: { sub?: unknown },
  payload: ViewAsPayload,
): Record<string, unknown> {
  const marker: ViewAsMarker = {
    adminSub: payload.adminSub,
    slug: payload.slug,
    clientId: payload.clientId,
    clientName: payload.clientName,
    startedAt: payload.iat,
    exp: payload.exp,
  }
  return {
    sub: typeof rawUser.sub === "string" ? rawUser.sub : payload.adminSub,
    name: payload.clientName || payload.slug,
    email: syntheticEmail(payload.slug),
    email_verified: false,
    [VIEW_AS_ROLE_CLAIM]: ["client"],
    [VIEW_AS_CLIENT_SLUG_CLAIM]: payload.slug,
    [VIEW_AS_CLIENT_SLUGS_CLAIM]: [payload.slug],
    app_metadata: { client_slug: payload.slug, client_slugs: [payload.slug] },
    __viewAs: marker,
  }
}

/** The view-as facts on a session user, or null for any real session. */
export function readViewAsMarker(user: unknown): ViewAsMarker | null {
  if (!user || typeof user !== "object") return null
  const marker = (user as Record<string, unknown>).__viewAs
  if (!marker || typeof marker !== "object") return null
  const m = marker as Record<string, unknown>
  if (typeof m.slug !== "string" || typeof m.adminSub !== "string" || typeof m.exp !== "number") return null
  return {
    adminSub: m.adminSub,
    slug: m.slug,
    clientId: typeof m.clientId === "number" ? m.clientId : null,
    clientName: typeof m.clientName === "string" ? m.clientName : m.slug,
    startedAt: typeof m.startedAt === "number" ? m.startedAt : 0,
    exp: m.exp,
  }
}

type SessionLike = { user: Record<string, unknown> } & Record<string, unknown>

export type ViewAsResolution<S> = {
  session: S
  /** absent: no cookie. active: overlay applied. ignored: a cookie was present but not applied. */
  status: "absent" | "active" | "ignored"
  reason?: "disabled" | "no_session" | "malformed" | "bad_signature" | "expired" | "not_admin" | "wrong_admin"
}

/** Applies the overlay to a raw session (see the module comment for the conditions). */
export async function resolveViewAs<S extends SessionLike | null>(
  session: S,
  token: string | null | undefined,
  options: { env?: Env; nowMs: number },
): Promise<ViewAsResolution<S>> {
  if (!token) return { session, status: "absent" }
  const env = options.env ?? (process.env as Env)
  if (!isViewAsEnabled(env)) return { session, status: "ignored", reason: "disabled" }
  if (!session || !session.user) return { session, status: "ignored", reason: "no_session" }
  const verified = await verifyViewAsToken(token, getViewAsSecret(env)!, options.nowMs)
  if (!verified.ok) return { session, status: "ignored", reason: verified.reason }
  if (!userHasAdminAccess(session.user as never)) return { session, status: "ignored", reason: "not_admin" }
  if (session.user.sub !== verified.payload.adminSub) return { session, status: "ignored", reason: "wrong_admin" }
  const user = buildViewAsUser(session.user, verified.payload)
  return { session: { ...session, user } as S, status: "active" }
}

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase())
}

/** While a client view is active: reads pass; writes pass only on the allowlist. */
export function isViewAsRequestAllowed(method: string, pathname: string, isApi: boolean): boolean {
  if (isSafeMethod(method)) return true
  if (!isApi) return false
  return VIEW_AS_WRITE_ALLOWLIST.includes(pathname)
}

/** Routes a stale client view may still call (exit, start a new one, audit). */
export const VIEW_AS_ENDED_API_ALLOWLIST: readonly string[] = [
  "/api/view-as/exit",
  "/api/view-as/audit",
  "/api/admin/view-as",
]

export type ViewAsGateDecision = { kind: "pass" } | { kind: "block_write" } | { kind: "ended" }

/**
 * Middleware decision (pure).
 * - Active overlay: writes outside the allowlist are blocked.
 * - A view-as or hint cookie with no active overlay, on a raw admin session:
 *   the client view ended (expired, switched off, tampered). Pages go to
 *   `/view-as/ended` and APIs answer 409, so the screen never silently flips
 *   to the admin view in front of a client.
 */
export function decideViewAsGate(input: {
  method: string
  pathname: string
  isApi: boolean
  viewAsActive: boolean
  viewAsCookiePresent: boolean
  hintPresent: boolean
  rawIsAdmin: boolean
}): ViewAsGateDecision {
  if (input.viewAsActive) {
    return isViewAsRequestAllowed(input.method, input.pathname, input.isApi)
      ? { kind: "pass" }
      : { kind: "block_write" }
  }
  if ((input.viewAsCookiePresent || input.hintPresent) && input.rawIsAdmin) {
    if (input.isApi) {
      return VIEW_AS_ENDED_API_ALLOWLIST.includes(input.pathname) ? { kind: "pass" } : { kind: "ended" }
    }
    if (input.pathname === "/view-as/ended" || input.pathname === "/view-as/start") return { kind: "pass" }
    return { kind: "ended" }
  }
  return { kind: "pass" }
}

export type CookieOptions = {
  httpOnly: boolean
  secure: boolean
  sameSite: "lax"
  path: "/"
  maxAge: number
}

export function viewAsCookieOptions(maxAgeSeconds: number): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor(maxAgeSeconds)) }
}

/** Both cookies, expired. `__Host-` needs Secure and Path=/ on the clear too. */
export function viewAsClearCookies(): Array<{ name: string; value: string; options: CookieOptions }> {
  return [
    { name: VIEW_AS_COOKIE, value: "", options: viewAsCookieOptions(0) },
    { name: VIEW_AS_HINT_COOKIE, value: "", options: viewAsCookieOptions(0) },
  ]
}

/** Reads the signed cookie from any request shape the app passes to getSession. */
export function readCookieFromRequestLike(req: unknown, name: string): string | null | undefined {
  if (!req || typeof req !== "object") return undefined
  const r = req as { cookies?: unknown; headers?: unknown }
  const cookies = r.cookies as { get?: (n: string) => unknown } | Record<string, unknown> | undefined
  if (cookies && typeof (cookies as { get?: unknown }).get === "function") {
    const hit = (cookies as { get: (n: string) => unknown }).get(name)
    if (typeof hit === "string") return hit
    if (hit && typeof hit === "object" && typeof (hit as { value?: unknown }).value === "string") {
      return (hit as { value: string }).value
    }
    return null
  }
  if (cookies && typeof cookies === "object" && typeof (cookies as Record<string, unknown>)[name] === "string") {
    return (cookies as Record<string, string>)[name]
  }
  const headers = r.headers as { get?: (n: string) => unknown; cookie?: unknown } | undefined
  let header: unknown = null
  if (headers && typeof headers.get === "function") header = headers.get("cookie")
  else if (headers && typeof headers === "object") header = headers.cookie
  if (typeof header !== "string") return null
  for (const part of header.split(";")) {
    const idx = part.indexOf("=")
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        return part.slice(idx + 1).trim()
      }
    }
  }
  return null
}
