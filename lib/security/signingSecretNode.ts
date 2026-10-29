/**
 * Sync form of lib/security/signingSecret.ts for Node code (same derivation,
 * same order: feature secret, then APP_SIGNING_SECRET, then none).
 */
import "server-only"

import { createHmac } from "node:crypto"

import { appSigningSecret, derivationMessage, legacySigningSecret, type SigningPurpose } from "./signingSecret"

export function signingKeyForSync(purpose: SigningPurpose, env: Record<string, string | undefined> = process.env): string | null {
  const legacy = legacySigningSecret(purpose, env)
  if (legacy) return legacy
  const master = appSigningSecret(env)
  if (!master) return null
  return createHmac("sha256", master).update(derivationMessage(purpose)).digest("base64url")
}
