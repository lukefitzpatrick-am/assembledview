/**
 * Edit client form: schema, defaults and PUT payload.
 *
 * Every optional field accepts a DB null. Null becomes undefined before
 * validation, so a column that was never filled in can't block a save.
 * Undefined keys are left out of the JSON body, and the PUT route drops
 * null / "" values, so a save never writes a column the user didn't fill in.
 *
 * The legacy platform id columns (idgoogleads ... idshopify) are not part of
 * this form. Platform accounts live in PlatformAccountsSection. The columns
 * stay in the DB because creative (idmeta = Meta page id) and Ava summaries
 * still read them, so the payload never carries them.
 */
import * as z from "zod"
import { ABN_FORMAT_MESSAGE, isAbnBlankOrElevenDigits, normalizeAbn } from "./abn"
import { DEFAULT_CLIENT_BRAND_COLOUR } from "./brandColour"

export const LEGACY_PLATFORM_ID_FIELDS = [
  "idgoogleads",
  "idmeta",
  "idcm360",
  "iddv360",
  "idtiktok",
  "idlinkedin",
  "idpinterest",
  "idquantcast",
  "idtaboola",
  "idsnapchat",
  "idbing",
  "idvistar",
  "idga4",
  "idmerchantcentre",
  "idshopify",
] as const

export const BRAIN_LINK_FIELDS = [
  "website",
  "facebook_url",
  "instagram_url",
  "linkedin_url",
  "tiktok_url",
  "client_brain",
] as const

export const CLIENT_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT"] as const

/**
 * Runs `prep` before `inner`. The cast keeps the inner schema's types, so the
 * form's value types don't widen to `unknown`.
 */
function withPreprocess<T extends z.ZodType>(prep: (value: unknown) => unknown, inner: T): T {
  return z.preprocess(prep, inner) as unknown as T
}

const nullToUndefined = (value: unknown) => (value === null ? undefined : value)

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value

/** null / "" / NaN → undefined; numeric strings → numbers. */
const toOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return undefined
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : value
  }
  if (typeof value === "number" && Number.isNaN(value)) return undefined
  return value
}

/** The postcode input writes 0 when empty, and some rows hold "0". Treat both as unset. */
const toOptionalPostcode = (value: unknown) => {
  const n = toOptionalNumber(value)
  return n === 0 ? undefined : n
}

const optionalString = withPreprocess(nullToUndefined, z.string().optional())

const optionalNumber = (inner: z.ZodNumber) => withPreprocess(toOptionalNumber, inner.optional())

const optionalBoolean = withPreprocess(nullToUndefined, z.boolean().optional())

const optionalEmail = withPreprocess(
  nullToUndefined,
  z.string().email("Invalid email address").optional().or(z.literal(""))
)

/** Empty string or a parseable URL (protocol optional — https:// is assumed). */
const optionalUrlOrEmpty = withPreprocess(
  nullToUndefined,
  z
    .string()
    .optional()
    .or(z.literal(""))
    .superRefine((val, ctx) => {
      if (val == null || val.trim() === "") return
      const trimmed = val.trim()
      const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      try {
        new URL(candidate)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a valid URL or empty",
        })
      }
    })
)

const percentFee = () => optionalNumber(z.number().min(0).max(100))
const nonNegative = () => optionalNumber(z.number().nonnegative())

export const clientEditSchema = z.object({
  id: z.number(),
  clientname_input: z.string().min(1, "Client name is required"),
  mbaidentifier: z.string().min(1, "MBA Identifier is required"),
  clientcategory: optionalString,
  website: optionalUrlOrEmpty,
  facebook_url: optionalUrlOrEmpty,
  instagram_url: optionalUrlOrEmpty,
  linkedin_url: optionalUrlOrEmpty,
  tiktok_url: optionalUrlOrEmpty,
  client_brain: optionalString,
  // Spaces and punctuation stripped, then exactly 11 digits (or blank).
  // Saves the digits only. The check digit is a form warning, not an error.
  abn: withPreprocess(
    (value) => (value === null ? undefined : typeof value === "number" ? String(value) : value),
    z
      .string()
      .transform((s) => normalizeAbn(s))
      .pipe(z.string().refine(isAbnBlankOrElevenDigits, { message: ABN_FORMAT_MESSAGE }))
      .optional()
  ),
  legalbusinessname: optionalString,
  streetaddress: optionalString,
  suburb: optionalString,
  state_dropdown: withPreprocess(blankToUndefined, z.enum(CLIENT_STATES).optional()),
  postcode: withPreprocess(toOptionalPostcode, z.number().int().min(1000).max(9999).optional()),
  payment_days: optionalNumber(
    z.number().int().positive({
      message: "Payment days must be a positive whole number",
    })
  ),
  payment_terms: optionalString,
  keyfirstname: optionalString,
  keylastname: optionalString,
  keyphone: optionalString,
  keyemail: optionalEmail,
  billingfirstname: optionalString,
  billinglastname: optionalString,
  billingphone: optionalString,
  billingemail: optionalEmail,
  monthlyretainer: nonNegative(),
  organicsocial: nonNegative(),
  television_checkbox: optionalBoolean,
  radio_checkbox: optionalBoolean,
  newspapers_checkbox: optionalBoolean,
  magazines_checkbox: optionalBoolean,
  ooh_checkbox: optionalBoolean,
  cinema_checkbox: optionalBoolean,
  digitaldisplay_checkbox: optionalBoolean,
  digitalaudio_checkbox: optionalBoolean,
  digitalvideo_checkbox: optionalBoolean,
  bvod_checkbox: optionalBoolean,
  feesocial: percentFee(),
  feesearch: percentFee(),
  feeprogdisplay: percentFee(),
  feeprogvideo: percentFee(),
  feeprogbvod: percentFee(),
  feeprogaudio: percentFee(),
  feeprogooh: percentFee(),
  feecontentcreator: percentFee(),
  adservvideo: nonNegative(),
  adservimp: nonNegative(),
  adservdisplay: nonNegative(),
  adservaudio: nonNegative(),
  brand_colour: withPreprocess(
    nullToUndefined,
    z
      .string()
      .regex(/^#?[0-9A-Fa-f]{6}$/, "Brand colour must be a valid 6-digit hex code.")
      .optional()
      .or(z.literal(""))
  ),
})

export type ClientEditFormValues = z.infer<typeof clientEditSchema>

/** Text inputs: a null here would make the input uncontrolled, so these default to "". */
const TEXT_FIELDS = [
  "clientcategory",
  "legalbusinessname",
  "streetaddress",
  "suburb",
  "payment_terms",
  "keyfirstname",
  "keylastname",
  "keyemail",
  "billingfirstname",
  "billinglastname",
  "billingemail",
  ...BRAIN_LINK_FIELDS,
] as const

export function asOptionalString(value: unknown): string {
  if (value == null) return ""
  return String(value)
}

/**
 * Form defaults from a client row (list or by-id API).
 * Legacy id* keys are dropped. Other nulls become "" (text) or undefined.
 */
export function buildEditClientDefaults(
  client: Record<string, unknown> & { id: number }
): ClientEditFormValues {
  const legacy = new Set<string>(LEGACY_PLATFORM_ID_FIELDS)
  const base: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(client)) {
    if (legacy.has(key)) continue
    base[key] = value === null ? undefined : value
  }
  for (const key of TEXT_FIELDS) {
    base[key] = asOptionalString(client[key])
  }
  return {
    ...base,
    id: client.id,
    // Handle both mp_client_name and clientname_input field names
    clientname_input: asOptionalString(client.mp_client_name || client.clientname_input),
    mbaidentifier: asOptionalString(client.mbaidentifier),
    payment_days: (client.payment_days as number | null | undefined) ?? 30,
    brand_colour: (client.brand_colour as string | null | undefined) ?? DEFAULT_CLIENT_BRAND_COLOUR,
    // Show "0" / non-numeric postcodes as empty; the schema drops them anyway
    postcode: ((): number | undefined => {
      const n = toOptionalPostcode(client.postcode)
      return typeof n === "number" ? n : undefined
    })(),
    // ABN may arrive as a number
    abn: client.abn ? String(client.abn) : "",
    // Phone numbers as strings
    keyphone: client.keyphone ? String(client.keyphone) : "",
    billingphone: client.billingphone ? String(client.billingphone) : "",
  } as ClientEditFormValues
}

/** PUT body for `/api/clients/[id]`. Never carries the legacy id* columns. */
export function buildEditClientPayload(
  data: ClientEditFormValues,
  options: { isAdmin: boolean; initialClientBrain: string; now?: () => number }
): Record<string, unknown> {
  const { clientname_input, ...restData } = data
  const payload: Record<string, unknown> = {
    ...restData,
    mp_client_name: clientname_input,
  }
  for (const field of LEGACY_PLATFORM_ID_FIELDS) {
    delete payload[field]
  }
  // UI-gate only: non-admins must never write brain/link fields (even if defaults rode along).
  if (!options.isAdmin) {
    for (const field of BRAIN_LINK_FIELDS) {
      delete payload[field]
    }
  } else {
    const nextBrain = data.client_brain ?? ""
    if (nextBrain !== options.initialClientBrain) {
      payload.client_brain_updated_at = (options.now ?? Date.now)()
    }
  }
  return payload
}

export const EDIT_CLIENT_FIELD_LABELS: Record<string, string> = {
  id: "Client id",
  clientname_input: "Client Name",
  mbaidentifier: "MBA Identifier",
  clientcategory: "Client Category",
  website: "Website",
  facebook_url: "Facebook",
  instagram_url: "Instagram",
  linkedin_url: "LinkedIn",
  tiktok_url: "TikTok",
  client_brain: "Client marketing brain",
  abn: "ABN",
  legalbusinessname: "Legal Business Name",
  streetaddress: "Street Address",
  suburb: "Suburb",
  state_dropdown: "State",
  postcode: "Postcode",
  payment_days: "Payment Days",
  payment_terms: "Payment Terms",
  keyfirstname: "Key contact first name",
  keylastname: "Key contact last name",
  keyphone: "Key contact phone",
  keyemail: "Key contact email",
  billingfirstname: "Billing first name",
  billinglastname: "Billing last name",
  billingphone: "Billing phone",
  billingemail: "Billing email",
  monthlyretainer: "Monthly Retainer",
  organicsocial: "Organic Social",
  feesocial: "Fee: Social Media",
  feesearch: "Fee: Search",
  feeprogdisplay: "Fee: Prog Display",
  feeprogvideo: "Fee: Prog Video",
  feeprogbvod: "Fee: Prog BVOD",
  feeprogaudio: "Fee: Prog Audio",
  feeprogooh: "Fee: Prog OOH",
  feecontentcreator: "Fee: Content Creator",
  adservvideo: "Ad serving: Video",
  adservimp: "Ad serving: Impression",
  adservdisplay: "Ad serving: Display",
  adservaudio: "Ad serving: Audio",
  television_checkbox: "Television",
  radio_checkbox: "Radio",
  newspapers_checkbox: "Newspapers",
  magazines_checkbox: "Magazines",
  ooh_checkbox: "OOH",
  cinema_checkbox: "Cinema",
  digitaldisplay_checkbox: "Digital Display",
  digitalaudio_checkbox: "Digital Audio",
  digitalvideo_checkbox: "Digital Video",
  bvod_checkbox: "BVOD",
  brand_colour: "Brand Colour",
}

/** "Label: message" for each invalid field, in form order. */
export function describeInvalidFields(
  errors: Partial<Record<string, { message?: unknown } | undefined>>
): string[] {
  const out: string[] = []
  for (const [field, error] of Object.entries(errors)) {
    if (!error) continue
    const label = EDIT_CLIENT_FIELD_LABELS[field] ?? field
    const message = typeof error.message === "string" && error.message ? error.message : "Invalid value"
    out.push(`${label}: ${message}`)
  }
  return out
}
