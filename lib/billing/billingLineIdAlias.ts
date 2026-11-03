/**
 * MB-30 (B20): old line-id schemes and their current alias.
 *
 * The editor rebuilds every line id from MBA + current media code + line
 * number when it loads a plan (`assignStableLineItemNumbers`), so a line saved
 * as `PGAAUS010ML1` (the pre-May catch-all `ML` code) shows on edit as
 * `PGAAUS010DD1`, a no-code `PGAAUS0051` as `PGAAUS005SM1`, and a production
 * `PGAAUS010-production-v510-p1` as `PGAAUS010PROD1`. Saved billing rows keep
 * the old id. This helper gives both ids the same alias key, so billing rows
 * can be matched to the line they belong to (decision Q3: keep the rewrite and
 * alias-match).
 *
 * Alias key: `<mediaKey>|<line number>`, from a bare or `billing-<media>::`
 * decorated id, when the bare id is one of:
 * - `<mba><current code for mediaKey><n>` (current scheme)
 * - `<mba>ML<n>` (old catch-all code, not production)
 * - `<mba><n>` (old no-code id, not production)
 * - `<mba>-production-v<id>-p<n>` (old production id, production only)
 * The MBA prefix is matched case-insensitively (`hema001` and `HEMA001`).
 * Any other shape (another channel's code, a template id, a placeholder
 * `new-N`, a blank MBA number) has no alias: null.
 */

import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"

/** Billing media keys (`billing-<key>::`, `BillingMonth.lineItems` keys) to their current line-id code. */
const BILLING_KEY_ID_CODES: Readonly<Record<string, string>> = {
  television: MEDIA_TYPE_ID_CODES.television,
  radio: MEDIA_TYPE_ID_CODES.radio,
  newspaper: MEDIA_TYPE_ID_CODES.newspaper,
  magazines: MEDIA_TYPE_ID_CODES.magazines,
  ooh: MEDIA_TYPE_ID_CODES.ooh,
  cinema: MEDIA_TYPE_ID_CODES.cinema,
  digiDisplay: MEDIA_TYPE_ID_CODES.digitalDisplay,
  digiAudio: MEDIA_TYPE_ID_CODES.digitalAudio,
  digiVideo: MEDIA_TYPE_ID_CODES.digitalVideo,
  bvod: MEDIA_TYPE_ID_CODES.bvod,
  integration: MEDIA_TYPE_ID_CODES.integration,
  search: MEDIA_TYPE_ID_CODES.search,
  socialMedia: MEDIA_TYPE_ID_CODES.socialMedia,
  progDisplay: MEDIA_TYPE_ID_CODES.progDisplay,
  progVideo: MEDIA_TYPE_ID_CODES.progVideo,
  progBvod: MEDIA_TYPE_ID_CODES.progBVOD,
  progAudio: MEDIA_TYPE_ID_CODES.progAudio,
  progOoh: MEDIA_TYPE_ID_CODES.progOOH,
  influencers: MEDIA_TYPE_ID_CODES.influencers,
  production: MEDIA_TYPE_ID_CODES.production,
}

/** Current line-id code for a billing media key, or null when the key is unknown. */
export function currentLineIdCodeForBillingKey(mediaKey: string): string | null {
  return BILLING_KEY_ID_CODES[String(mediaKey ?? "").trim()] ?? null
}

export type BillingLineIdScheme = "current" | "old"

export type BillingLineIdAliasInput = {
  id: unknown
  mediaKey: string
  mbaNumber: string | null | undefined
}

export type BillingLineIdAlias = {
  /** `<mediaKey>|<n>`: the same for an old id and its current alias. */
  key: string
  scheme: BillingLineIdScheme
  lineNumber: number
}

const PRODUCTION_OLD = /^-production-v\d+-p(\d+)$/i
const CODE_AND_NUMBER = /^([A-Za-z]*)(\d+)$/

/** Alias of a billing row id, or null when the id is not in a known scheme for this MBA and media key. */
export function billingLineIdAlias(input: BillingLineIdAliasInput): BillingLineIdAlias | null {
  const mba = String(input.mbaNumber ?? "").trim()
  const mediaKey = String(input.mediaKey ?? "").trim()
  if (!mba || !mediaKey) return null
  const bare = toBillingOverrideLineItemId(String(input.id ?? "").trim())
  if (bare.length <= mba.length) return null
  if (bare.slice(0, mba.length).toLowerCase() !== mba.toLowerCase()) return null
  const rest = bare.slice(mba.length)
  const currentCode = currentLineIdCodeForBillingKey(mediaKey)
  const isProduction = mediaKey === "production"

  const make = (scheme: BillingLineIdScheme, n: number): BillingLineIdAlias | null =>
    Number.isInteger(n) && n > 0 ? { key: `${mediaKey}|${n}`, scheme, lineNumber: n } : null

  if (isProduction) {
    const old = PRODUCTION_OLD.exec(rest)
    if (old) return make("old", Number(old[1]))
  }
  const m = CODE_AND_NUMBER.exec(rest)
  if (!m) return null
  const code = m[1]!.toUpperCase()
  const n = Number(m[2])
  if (currentCode && code === currentCode) return make("current", n)
  if (isProduction) return null
  if (code === "ML" || code === "") return make("old", n)
  return null
}

/** `billingLineIdAlias(...)?.key ?? null`. */
export function billingLineAliasKey(input: BillingLineIdAliasInput): string | null {
  return billingLineIdAlias(input)?.key ?? null
}
