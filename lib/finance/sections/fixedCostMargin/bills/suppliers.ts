/**
 * Who sent a bill, and which AV publisher a media owner on a bill line means.
 * Pure. No I/O.
 */

export type SupplierKind = "channel_factory" | "advertising_associates" | "direct_publisher"

/**
 * Publishers that bill us directly although an Advertising Associates
 * publisher of the same name exists. Luke, 27 Oct (Q8): a direct bill matches
 * the direct publisher, never the AA one. `publisher` is the AV publisher the
 * direct bill matches; null means no direct publisher exists yet, so those
 * bill lines go to the manual list. Matched on the Xero contact name.
 */
export const DIRECT_SUPPLIERS: ReadonlyArray<{ contact: RegExp; publisher: string | null }> = [
  { contact: /^broadsheet media\b/i, publisher: "Broadsheet - AM" },
  { contact: /^are media\b/i, publisher: null },
  { contact: /^linkby\b/i, publisher: null },
  { contact: /^leba$/i, publisher: null },
  { contact: /^news pty\b/i, publisher: null },
  { contact: /^nova c\/o\b/i, publisher: null },
]

const CF_CONTACT = /^channel factory\b/i
const AA_CONTACT = /^advertising associates\b/i

/** Postgres regex (case-insensitive `~*`) for the contacts the report loads. */
export const BILL_CONTACT_SQL_REGEX =
  "^(channel factory|advertising associates|broadsheet media|are media|linkby|leba$|news pty|nova c/o)"

export function supplierKindOf(contactName: string): SupplierKind | null {
  const name = contactName.trim()
  if (CF_CONTACT.test(name)) return "channel_factory"
  if (AA_CONTACT.test(name)) return "advertising_associates"
  if (DIRECT_SUPPLIERS.some((d) => d.contact.test(name))) return "direct_publisher"
  return null
}

/** The AV publisher a direct supplier's bills match, or null when none is set up. */
export function directSupplierPublisher(contactName: string): string | null {
  const hit = DIRECT_SUPPLIERS.find((d) => d.contact.test(contactName.trim()))
  return hit?.publisher ?? null
}

/**
 * Media owner text on an Advertising Associates bill line (masthead, station
 * or site) to the AV publisher name. Checked in order; first hit wins. Also
 * used for plan line publisher text that does not match a publisher by name
 * (for example "The Herald Sun", "Australian Golf Digest - ...").
 *
 * Evidence (FY27 bills against plan lines, 27 Oct 2026): KAYO Digital
 * 9,246.10 = golf025DV1-DV4 (Foxtel Media) Sep; Weekly Times 3,870 =
 * BOSS010NP1 (News Corp) Sep; Queensland Country Life 2,134 and Farm Weekly
 * 1,319 = BOSS010 ACM lines Sep; Seven Network / 7Plus = PENFOLD018TV1 / DV1;
 * 2GB, 3AW, 4BC = hartm015 Nine radio; 2WS, Gold FM, 97.3 = hartm015 ARN.
 * Luke to confirm the list.
 */
export const MEDIA_OWNER_ALIASES: ReadonlyArray<{ pattern: RegExp; publisher: string }> = [
  { pattern: /kayo|foxtel/i, publisher: "Foxtel Media" },
  {
    pattern:
      /news\.com\.au|herald sun|daily telegraph|courier[- ]mail|weekly times|\bthe australian\b|news corp/i,
    publisher: "News Corp",
  },
  { pattern: /aus(tralian)? fin(ancial)? review|\bafr\b|\b2gb\b|\b3aw\b|\b4bc\b|\b6pr\b|^nine\b/i, publisher: "Nine" },
  { pattern: /\b2ws\b|gold fm|\b97\.3\b|\bkiis\b|\barn\b/i, publisher: "ARN - AM" },
  { pattern: /\bsca\b|southern cross|triple m|fox fm|2day fm|\bb105\b/i, publisher: "Southern Cross Austereo" },
  { pattern: /\bnova\b/i, publisher: "Nova" },
  { pattern: /seven network|\b7 ?plus\b|\bch\.? ?7\b|channel 7|^seven\b/i, publisher: "Seven" },
  { pattern: /\bthe land\b|queensland country life|farm weekly|australian community media/i, publisher: "Australian Community Media" },
  { pattern: /farmmachinerysales|carsales/i, publisher: "CarSales" },
  { pattern: /apartments\.com\.au/i, publisher: "Apartments.com.au" },
  { pattern: /realestate/i, publisher: "Realestate.com.au" },
  { pattern: /golf digest/i, publisher: "Golf Digest" },
  { pattern: /broadsheet/i, publisher: "Broadsheet" },
  { pattern: /cartology/i, publisher: "Cartology" },
  { pattern: /jc ?dec(e)?aux/i, publisher: "JCDecaux" },
  { pattern: /\bqms\b/i, publisher: "QMS" },
  { pattern: /\bjolt\b/i, publisher: "Jolt" },
  { pattern: /out of home media|\booh! ?media\b/i, publisher: "oOh! media" },
  { pattern: /\bgo media\b/i, publisher: "GO Media" },
  { pattern: /\blumo\b/i, publisher: "LUMO" },
  { pattern: /mediaworks/i, publisher: "MediaWorks Outdoor" },
  { pattern: /val morgan|\bvmo\b/i, publisher: "VMO" },
]

/** AV publisher name for media owner text, from the alias list. */
export function aliasPublisherFor(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  for (const a of MEDIA_OWNER_ALIASES) if (a.pattern.test(t)) return a.publisher
  return null
}
