/**
 * Signed Ava taint marker (F14 b, B36).
 *
 * marker = "t1." base64url(payload JSON) "." base64url(HMAC-SHA256(key, payload))
 * Key: APP_SIGNING_SECRET, purpose "ava-taint" (lib/security/signingSecret.ts).
 * No key: no marker is issued and any marker sent fails to verify, which the
 * taint rule treats as tainted (fail closed). The history notice still
 * carries taint without a key.
 *
 * The marker only ever says "tainted". It has no expiry: expiry could only
 * make a tainted conversation look clean.
 */
import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { signingKeyForSync } from "@/lib/security/signingSecretNode"

import type { TaintMarkerCheck } from "./taintRules"

const PREFIX = "t1"
const MAX_MARKER_LENGTH = 2_000

type TaintMarkerPayload = { v: 1; sub: string; cid: string; iat: number }

function mac(body: string, key: string): string {
  return createHmac("sha256", key).update(`${PREFIX}.${body}`).digest("base64url")
}

export function signTaintMarker(
  input: { sub: string; conversationId: string },
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): string | null {
  const key = signingKeyForSync("ava-taint", env)
  if (!key) return null
  const payload: TaintMarkerPayload = { v: 1, sub: input.sub, cid: input.conversationId, iat: now.getTime() }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${PREFIX}.${body}.${mac(body, key)}`
}

export function verifyTaintMarker(
  marker: string,
  env: Record<string, string | undefined> = process.env,
): TaintMarkerCheck {
  const key = signingKeyForSync("ava-taint", env)
  if (!key) return { ok: false }
  if (marker.length > MAX_MARKER_LENGTH) return { ok: false }
  const parts = marker.split(".")
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false }
  const [, body, given] = parts as [string, string, string]
  if (!body || !given) return { ok: false }
  const expected = Buffer.from(mac(body, key))
  const actual = Buffer.from(given)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false }
  let payload: Partial<TaintMarkerPayload>
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TaintMarkerPayload>
  } catch {
    return { ok: false }
  }
  if (payload?.v !== 1 || typeof payload.sub !== "string" || typeof payload.cid !== "string") return { ok: false }
  return { ok: true, sub: payload.sub, conversationId: payload.cid }
}
