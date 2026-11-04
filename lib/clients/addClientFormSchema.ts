/**
 * Add client form: schema, defaults and POST payload.
 *
 * Built from the Edit client schema (lib/clients/editClientFormSchema.ts), so
 * both forms share the same null-safe optional fields. The Add form does not
 * carry the record id or the admin-only brain / link fields.
 *
 * The 15 legacy platform id columns (idgoogleads ... idshopify) are not part of
 * this form. Platform accounts (including the Meta page id, platform meta_page)
 * are added in Platform accounts on the client page after the client exists.
 * The payload never carries the legacy columns.
 */
import * as z from "zod"

import { ABN_FORMAT_MESSAGE, isAbnBlankOrElevenDigits, normalizeAbn } from "./abn"
import { DEFAULT_CLIENT_BRAND_COLOUR } from "./brandColour"
import {
  LEGACY_FEE_FORM_FIELDS,
  LEGACY_PLATFORM_ID_FIELDS,
  clientEditSchema,
  stripChannelFeeFields,
} from "./editClientFormSchema"

export { normalizeAbn }

/**
 * Strip spaces and punctuation, then exactly 11 digits (or empty). Saves the
 * digits only. The check digit is a form warning (`abnChecksumWarning`), not
 * a schema error.
 */
const abnInner = z
  .string()
  .transform((s) => normalizeAbn(s))
  .pipe(z.string().refine(isAbnBlankOrElevenDigits, { message: ABN_FORMAT_MESSAGE }))

/** null / undefined become "" first. The cast keeps the string input type for the form. */
const addAbn = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  abnInner
) as unknown as typeof abnInner

export const clientAddSchema = clientEditSchema
  .omit({
    id: true,
    website: true,
    facebook_url: true,
    instagram_url: true,
    linkedin_url: true,
    tiktok_url: true,
    client_brain: true,
  })
  .extend({ abn: addAbn })

export type ClientAddFormInput = z.input<typeof clientAddSchema>
export type ClientAddFormValues = z.output<typeof clientAddSchema>

function defaultFees<K extends string>(fields: readonly K[], value: number): Record<K, number> {
  return Object.fromEntries(fields.map((field) => [field, value])) as Record<K, number>
}

export const ADD_CLIENT_DEFAULTS: ClientAddFormInput = {
  clientname_input: "",
  mbaidentifier: "",
  clientcategory: "",
  abn: "",
  legalbusinessname: "",
  streetaddress: "",
  suburb: "",
  state_dropdown: "NSW",
  postcode: undefined,
  payment_days: undefined,
  payment_terms: "",
  keyfirstname: "",
  keylastname: "",
  keyphone: "",
  keyemail: "",
  billingfirstname: "",
  billinglastname: "",
  billingphone: "",
  billingemail: "",
  monthlyretainer: 0,
  organicsocial: 0,
  television_checkbox: true,
  radio_checkbox: true,
  newspapers_checkbox: true,
  magazines_checkbox: true,
  ooh_checkbox: true,
  cinema_checkbox: true,
  digitaldisplay_checkbox: true,
  digitalaudio_checkbox: true,
  digitalvideo_checkbox: true,
  bvod_checkbox: true,
  // The 8 original fees default to 20% (CLIENT_FEE_CHANNELS, B22). The 12
  // from 0113 are left out: blank, so a new client has none (decision B22 Q3).
  ...defaultFees(LEGACY_FEE_FORM_FIELDS, 20),
  adservvideo: 0.89,
  adservimp: 0.12,
  adservdisplay: 0.12,
  adservaudio: 0.4,
  brand_colour: DEFAULT_CLIENT_BRAND_COLOUR,
}

/**
 * POST body for `/api/clients`. Never carries the legacy id* columns. The 12
 * channel fees from 0113 ride along only for an admin with the switch
 * channel_client_fees on (B22); they default blank, so a new client has none.
 */
export function buildAddClientPayload(
  data: ClientAddFormValues,
  options: { isAdmin: boolean; channelFees?: boolean } = { isAdmin: false }
): Record<string, unknown> {
  const { clientname_input, ...restData } = data
  const payload: Record<string, unknown> = {
    ...restData,
    mp_client_name: clientname_input,
    client_name: clientname_input, // Xano input expects client_name mapped to mp_client_name
  }
  for (const field of LEGACY_PLATFORM_ID_FIELDS) {
    delete payload[field]
  }
  stripChannelFeeFields(payload, options)
  return payload
}
