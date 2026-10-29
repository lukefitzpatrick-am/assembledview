/**
 * One shared signing secret (Luke, 30 Oct 2026): APP_SIGNING_SECRET.
 *
 * Each purpose gets its own key, derived as
 *   base64url(HMAC-SHA256(APP_SIGNING_SECRET, "assembledview/signing/v1/" + purpose))
 * so a token for one feature never verifies for another.
 *
 * A feature's own secret (VIEW_AS_SECRET, BILLING_REVISION_TOKEN_SECRET) still
 * wins when it is set and long enough, so live sessions and tokens keep
 * working. New features take a purpose here and never add a secret env var.
 * CRON_SECRET stays as it is (Vercel cron convention).
 *
 * This file is edge safe (Web Crypto only). Node code that needs a sync key
 * uses lib/security/signingSecretNode.ts, which derives the same value.
 */

export const APP_SIGNING_SECRET_MIN_LENGTH = 32

export type SigningPurpose = "view-as" | "billing-revision-preview"

type Env = Record<string, string | undefined>

/** The feature secret each purpose honoured before APP_SIGNING_SECRET. */
export const SIGNING_PURPOSES: Record<SigningPurpose, { legacyEnv: string; legacyMinLength: number }> = {
  "view-as": { legacyEnv: "VIEW_AS_SECRET", legacyMinLength: 32 },
  "billing-revision-preview": { legacyEnv: "BILLING_REVISION_TOKEN_SECRET", legacyMinLength: 16 },
}

export function derivationMessage(purpose: SigningPurpose): string {
  return `assembledview/signing/v1/${purpose}`
}

export function appSigningSecret(env: Env = process.env as Env): string | null {
  const s = String(env.APP_SIGNING_SECRET ?? "").trim()
  return s.length >= APP_SIGNING_SECRET_MIN_LENGTH ? s : null
}

export function legacySigningSecret(purpose: SigningPurpose, env: Env = process.env as Env): string | null {
  const { legacyEnv, legacyMinLength } = SIGNING_PURPOSES[purpose]
  const raw = env[legacyEnv] ?? ""
  // VIEW_AS_SECRET was never trimmed; BILLING_REVISION_TOKEN_SECRET was.
  const s = purpose === "billing-revision-preview" ? raw.trim() : raw
  return s.length >= legacyMinLength ? s : null
}

/** True when a key exists for this purpose (no derivation). */
export function hasSigningKey(purpose: SigningPurpose, env: Env = process.env as Env): boolean {
  return legacySigningSecret(purpose, env) != null || appSigningSecret(env) != null
}

/** Where the key comes from, for the Features page. */
export function signingKeySource(purpose: SigningPurpose, env: Env = process.env as Env): "feature_secret" | "app_signing_secret" | "missing" {
  if (legacySigningSecret(purpose, env) != null) return "feature_secret"
  if (appSigningSecret(env) != null) return "app_signing_secret"
  return "missing"
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** The key for a purpose: the feature secret if set, else derived from APP_SIGNING_SECRET, else null. */
export async function signingKeyFor(purpose: SigningPurpose, env: Env = process.env as Env): Promise<string | null> {
  const legacy = legacySigningSecret(purpose, env)
  if (legacy) return legacy
  const master = appSigningSecret(env)
  if (!master) return null
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(master), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(derivationMessage(purpose))))
  return bytesToBase64Url(mac)
}
