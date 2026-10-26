/**
 * Billing-basis schedule_months rows copied from Supabase on 26 Oct 2026
 * (read only). [line_item_id, channel, client_pays, component m|f|a, month, cents]
 * buxton004 v10 (version id 12903), PENFOLD020 v29 (16999), penfold022 v3 (17414).
 */
import type { MonthLock, RevisionLine } from "../types"

type Row = readonly [string, string, boolean, "m" | "f" | "a", string, number]

export const BUXTON004_V10: Row[] = [
  ["buxton004DD1", "digi_display", false, "m", "2026-03", 269565],
  ["buxton004DD1", "digi_display", false, "m", "2026-04", 505435],
  ["buxton004DD1", "digi_display", false, "m", "2026-05", 522282],
  ["buxton004DD1", "digi_display", false, "m", "2026-06", 505435],
  ["buxton004DD1", "digi_display", false, "m", "2026-07", 522283],
  ["buxton004DD1", "digi_display", false, "m", "2026-08", 522283],
  ["buxton004DD1", "digi_display", false, "m", "2026-09", 505435],
  ["buxton004DD1", "digi_display", false, "m", "2026-10", 522282],
  ["buxton004DD1", "digi_display", false, "m", "2026-11", 505435],
  ["buxton004DD1", "digi_display", false, "m", "2026-12", 269565],
  ["buxton004DD5", "digi_display", false, "m", "2026-03", 150000],
  ["buxton004DD5", "digi_display", false, "m", "2026-04", 290000],
  ["buxton004DD5", "digi_display", false, "m", "2026-05", 160000],
  ["buxton004DD5", "digi_display", false, "m", "2026-07", 150000],
  ["buxton004DD5", "digi_display", false, "m", "2026-08", 295161],
  ["buxton004DD5", "digi_display", false, "m", "2026-09", 154839],
  ["buxton004DD6", "digi_display", false, "m", "2026-03", 1200000],
  ["buxton004DD7", "digi_display", false, "m", "2026-03", 331029],
  ["buxton004DD7", "digi_display", false, "m", "2026-04", 628928],
  ["buxton004DD7", "digi_display", false, "m", "2026-05", 649617],
  ["buxton004DD7", "digi_display", false, "m", "2026-06", 373219],
  ["buxton004DD7", "digi_display", false, "m", "2026-07", 326837],
  ["buxton004DD7", "digi_display", false, "m", "2026-08", 511418],
  ["buxton004DD7", "digi_display", false, "m", "2026-09", 503169],
  ["buxton004DD7", "digi_display", false, "m", "2026-10", 519667],
  ["buxton004DD7", "digi_display", false, "m", "2026-11", 503169],
  ["buxton004DD7", "digi_display", false, "m", "2026-12", 255709],
  ["buxton004SM1", "social", false, "m", "2026-03", 250000],
  ["buxton004SM1", "social", false, "m", "2026-04", 500000],
  ["buxton004SM1", "social", false, "m", "2026-05", 500000],
  ["buxton004SM1", "social", false, "m", "2026-06", 500000],
  ["buxton004SM1", "social", false, "m", "2026-07", 500000],
  ["buxton004SM1", "social", false, "m", "2026-08", 250000],
  ["buxton004SM1", "social", false, "f", "2026-03", 62500],
  ["buxton004SM1", "social", false, "f", "2026-04", 125000],
  ["buxton004SM1", "social", false, "f", "2026-05", 125000],
  ["buxton004SM1", "social", false, "f", "2026-06", 125000],
  ["buxton004SM1", "social", false, "f", "2026-07", 125000],
  ["buxton004SM1", "social", false, "f", "2026-08", 62500],
]

const P = (id: string, ch: string, comp: "m" | "a", m: string, c: number, cp = false): Row =>
  [`PENFOLD020${id}`, ch, cp, comp, m, c] as const

export const PENFOLD020_V29: Row[] = [
  P("DV1", "digi_video", "m", "2026-10", 363636), P("DV1", "digi_video", "m", "2026-11", 909091), P("DV1", "digi_video", "m", "2026-12", 727273),
  P("DV2", "digi_video", "m", "2026-10", 545455), P("DV2", "digi_video", "m", "2026-11", 1363636), P("DV2", "digi_video", "m", "2026-12", 1090909),
  P("IT1", "integrations", "m", "2026-12", 700000),
  P("IT10", "integrations", "m", "2026-10", 151630), P("IT10", "integrations", "m", "2026-11", 146739), P("IT10", "integrations", "m", "2026-12", 151631),
  P("IT3", "integrations", "m", "2026-12", 1400000),
  P("IT5", "integrations", "m", "2026-12", 900000),
  P("IT7", "integrations", "m", "2026-10", 235869), P("IT7", "integrations", "m", "2026-11", 228261), P("IT7", "integrations", "m", "2026-12", 235870),
  P("IT8", "integrations", "m", "2026-10", 117935), P("IT8", "integrations", "m", "2026-11", 114130), P("IT8", "integrations", "m", "2026-12", 117935),
  P("NP1", "newspaper", "m", "2026-12", 5000000),
  P("OH1", "ooh", "m", "2026-11", 1318286), P("OH1", "ooh", "m", "2026-12", 1086714),
  P("OH11", "ooh", "m", "2026-12", 300600),
  P("OH12", "ooh", "m", "2026-11", 425700),
  P("OH13", "ooh", "m", "2026-11", 68900), P("OH13", "ooh", "m", "2026-12", 413400),
  P("OH14", "ooh", "m", "2026-11", 189100),
  P("OH15", "ooh", "m", "2026-12", 190629), P("OH15", "ooh", "m", "2027-01", 142971),
  P("OH16", "ooh", "m", "2026-11", 208400),
  P("OH17", "ooh", "m", "2026-12", 129600),
  P("OH18", "ooh", "m", "2026-12", 39086), P("OH18", "ooh", "m", "2027-01", 29314),
  P("OH19", "ooh", "m", "2026-12", 112800),
  P("OH20", "ooh", "m", "2026-11", 340400),
  P("OH21", "ooh", "m", "2026-11", 60200),
  P("OH22", "ooh", "m", "2026-11", 302000),
  P("OH23", "ooh", "m", "2026-11", 72200),
  P("OH25", "ooh", "m", "2026-11", 227700),
  P("OH26", "ooh", "m", "2026-11", 267100),
  P("OH27", "ooh", "m", "2027-01", 71400),
  P("OH28", "ooh", "m", "2026-11", 136100),
  P("OH29", "ooh", "m", "2026-11", 484821), P("OH29", "ooh", "m", "2026-12", 420179),
  P("OH3", "ooh", "m", "2026-11", 18571), P("OH3", "ooh", "m", "2026-12", 501429),
  P("OH30", "ooh", "m", "2026-11", 403982), P("OH30", "ooh", "m", "2026-12", 350118),
  P("OH31", "ooh", "m", "2026-12", 241300),
  P("OH32", "ooh", "m", "2027-01", 64400),
  P("OH33", "ooh", "m", "2026-11", 214286), P("OH33", "ooh", "m", "2026-12", 5785714),
  P("OH34", "ooh", "m", "2026-12", 312900),
  P("OH35", "ooh", "m", "2026-12", 312900),
  P("OH36", "ooh", "m", "2026-12", 207300),
  P("OH38", "ooh", "m", "2026-12", 496300),
  P("OH4", "ooh", "m", "2026-11", 290000), P("OH4", "ooh", "m", "2026-12", 310000), P("OH4", "ooh", "m", "2027-01", 30000),
  P("OH40", "ooh", "m", "2026-12", 809991),
  P("OH41", "ooh", "m", "2026-12", 393900),
  P("OH42", "ooh", "m", "2026-12", 84300),
  P("OH46", "ooh", "m", "2026-12", 182900),
  P("OH5", "ooh", "m", "2026-11", 870000), P("OH5", "ooh", "m", "2026-12", 930000), P("OH5", "ooh", "m", "2027-01", 90000),
  P("OH6", "ooh", "m", "2026-11", 677747), P("OH6", "ooh", "m", "2026-12", 631005),
  P("OH7", "ooh", "m", "2026-11", 169435), P("OH7", "ooh", "m", "2026-12", 157749),
  P("OH8", "ooh", "m", "2026-11", 508308), P("OH8", "ooh", "m", "2026-12", 473252),
  P("OH9", "ooh", "m", "2026-12", 3589029), P("OH9", "ooh", "m", "2027-01", 598171),
  P("PD1", "prog_display", "a", "2026-10", 1542, true), P("PD1", "prog_display", "a", "2026-11", 3856, true), P("PD1", "prog_display", "a", "2026-12", 3085, true),
  P("PROD1", "production", "m", "2026-12", 1199509),
  P("PROD2", "production", "m", "2026-11", 187500), P("PROD2", "production", "m", "2026-12", 1162500),
  P("PROD3", "production", "m", "2026-11", 194444), P("PROD3", "production", "m", "2026-12", 1205556),
  P("PROD4", "production", "m", "2026-12", 430600),
  P("PROD5", "production", "m", "2026-11", 55244), P("PROD5", "production", "m", "2026-12", 428137), P("PROD5", "production", "m", "2027-01", 372894),
  P("PROD6", "production", "m", "2026-11", 265655), P("PROD6", "production", "m", "2026-12", 41945),
  P("SM2", "social", "m", "2026-12", 492572),
  P("SM4", "social", "m", "2026-12", 7428),
]

export const PENFOLD022_V3: Row[] = [
  ["penfold022DD1", "digi_display", false, "m", "2026-11", 300000],
  ["penfold022DD8", "digi_display", false, "m", "2026-11", 999999],
  ["penfold022PROD1", "production", false, "m", "2026-11", 362069],
  ["penfold022PROD1", "production", false, "m", "2026-12", 337931],
  ["penfold022SM1", "social", false, "m", "2026-11", 401786],
  ["penfold022SM1", "social", false, "m", "2026-12", 348214],
  ["penfold022SM2", "social", false, "m", "2026-11", 80357],
  ["penfold022SM2", "social", false, "m", "2026-12", 69643],
  ["penfold022SM3", "social", false, "m", "2026-11", 267857],
  ["penfold022SM3", "social", false, "m", "2026-12", 232143],
  ["penfold022SM4", "social", false, "m", "2026-11", 53571],
  ["penfold022SM4", "social", false, "m", "2026-12", 46429],
]

export function linesFromRows(rows: readonly Row[], aaLineIds: readonly string[] = []): RevisionLine[] {
  const map = new Map<string, RevisionLine>()
  for (const [id, channel, cp, comp, month, cents] of rows) {
    let line = map.get(id)
    if (!line) {
      line = {
        lineItemId: id,
        label: id,
        channel,
        isProduction: channel === "production",
        clientPaysForMedia: cp,
        isAaLine: aaLineIds.includes(id),
        media: {},
        fee: {},
        adserving: {},
      }
      map.set(id, line)
    }
    const rec = comp === "m" ? line.media : comp === "f" ? line.fee : line.adserving
    rec[month] = (rec[month] ?? 0) + cents
  }
  return [...map.values()]
}

/** buxton004 locks on 26 Oct 2026: Mar to Jun paid (xero: rows), Sep and Oct approved. */
export function buxtonLocks(): MonthLock[] {
  const hard = (month: string): MonthLock => ({
    month,
    level: "hard",
    reasons: ["past_month", "sent_to_accounts", "legacy_billed", "xero_outside_av"],
    past: true,
  })
  return [
    hard("2026-03"),
    hard("2026-04"),
    hard("2026-05"),
    hard("2026-06"),
    { month: "2026-07", level: "open", reasons: ["past_month"], past: true },
    { month: "2026-08", level: "open", reasons: ["past_month"], past: true },
    { month: "2026-09", level: "soft", reasons: ["past_month", "approved"], past: true },
    { month: "2026-10", level: "soft", reasons: ["approved"], past: false },
    { month: "2026-11", level: "open", reasons: [], past: false },
    { month: "2026-12", level: "open", reasons: [], past: false },
  ]
}

export const BUXTON_CAMPAIGN = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
export const PENFOLD020_CAMPAIGN = ["2026-10", "2026-11", "2026-12", "2027-01"]
export const PENFOLD022_CAMPAIGN = ["2026-11", "2026-12"]

export const DEFAULT_OPTIONS = {
  unlockApprovedMonths: [] as string[],
  includeProduction: false,
  feeMode: "follow" as const,
  adservingMode: "keep" as const,
}
