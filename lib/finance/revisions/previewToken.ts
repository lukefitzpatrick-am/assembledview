/**
 * Signed preview token (design 4.2). The apply route and the Ava apply tool
 * accept only a token from a preview, so the inputs cannot change between
 * what the user saw and what is written.
 *
 * token = base64url(payload JSON) "." base64url(HMAC-SHA256(secret, payload))
 * Secret: BILLING_REVISION_TOKEN_SECRET (server only). Missing secret = no
 * tokens at all (fail closed).
 */
import { createHmac, timingSafeEqual } from "node:crypto"

import type { RevisionOptions, RevisionRequest } from "./types"

export const PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000

export type PreviewTokenPayload = {
  v: 1
  mbaNumber: string
  baseVersionId: number
  hash: string
  request: RevisionRequest
  options: RevisionOptions
  reason: string
  source: "ui" | "ava"
  restoresRevisionId: number | null
  sub: string
  exp: number
}

export type PreviewTokenError = "TOKEN_SECRET_MISSING" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | "TOKEN_OTHER_USER"

function secret(): string | null {
  const s = String(process.env.BILLING_REVISION_TOKEN_SECRET ?? "").trim()
  return s.length >= 16 ? s : null
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url")
}

function sign(body: string, key: string): string {
  return b64url(createHmac("sha256", key).update(body).digest())
}

export function signPreviewToken(
  payload: Omit<PreviewTokenPayload, "v" | "exp">,
  now: Date = new Date(),
): { token: string; expiresAt: string } | { error: "TOKEN_SECRET_MISSING" } {
  const key = secret()
  if (!key) return { error: "TOKEN_SECRET_MISSING" }
  const exp = now.getTime() + PREVIEW_TOKEN_TTL_MS
  const body = b64url(JSON.stringify({ v: 1, ...payload, exp }))
  return { token: `${body}.${sign(body, key)}`, expiresAt: new Date(exp).toISOString() }
}

export function verifyPreviewToken(
  token: unknown,
  args: { sub: string | null | undefined; now?: Date },
): { ok: true; payload: PreviewTokenPayload } | { ok: false; error: PreviewTokenError } {
  const key = secret()
  if (!key) return { ok: false, error: "TOKEN_SECRET_MISSING" }
  if (typeof token !== "string" || token.length > 20_000) return { ok: false, error: "TOKEN_INVALID" }
  const [body, mac, extra] = token.split(".")
  if (!body || !mac || extra !== undefined) return { ok: false, error: "TOKEN_INVALID" }
  const expected = Buffer.from(sign(body, key))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, error: "TOKEN_INVALID" }
  }
  let payload: PreviewTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewTokenPayload
  } catch {
    return { ok: false, error: "TOKEN_INVALID" }
  }
  if (payload?.v !== 1 || typeof payload.exp !== "number") return { ok: false, error: "TOKEN_INVALID" }
  if ((args.now ?? new Date()).getTime() > payload.exp) return { ok: false, error: "TOKEN_EXPIRED" }
  if (!args.sub || payload.sub !== args.sub) return { ok: false, error: "TOKEN_OTHER_USER" }
  return { ok: true, payload }
}

export const PREVIEW_TOKEN_MESSAGES: Record<PreviewTokenError, string> = {
  TOKEN_SECRET_MISSING: "Billing revisions are not set up on this server (BILLING_REVISION_TOKEN_SECRET).",
  TOKEN_INVALID: "This preview is not valid. Preview again.",
  TOKEN_EXPIRED: "This preview has expired (15 minutes). Preview again.",
  TOKEN_OTHER_USER: "This preview belongs to another user. Preview again.",
}
