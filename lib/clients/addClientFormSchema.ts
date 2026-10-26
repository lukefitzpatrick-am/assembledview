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

import { DEFAULT_CLIENT_BRAND_COLOUR } from "./brandColour"
import { LEGACY_PLATFORM_ID_FIELDS, clientEditSchema } from "./editClientFormSchema"

/** Same rule as before: strip spaces and symbols, then 11 letters or numbers (or empty). */
export const normalizeAbn = (value: string) => value.replace(/[^A-Za-z0-9]/g, "")

const abnInner = z
  .string()
  .transform((s) => normalizeAbn(s))
  .pipe(
    z.string().refine((s) => s === "" || /^[A-Za-z0-9]{11}$/.test(s), {
      message: "ABN must contain 11 letters or numbers after removing spaces or symbols",
    })
  )

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
  feesocial: 20,
  feesearch: 20,
  feeprogdisplay: 20,
  feeprogvideo: 20,
  feeprogbvod: 20,
  feeprogaudio: 20,
  feeprogooh: 20,
  feecontentcreator: 20,
  adservvideo: 0.89,
  adservimp: 0.12,
  adservdisplay: 0.12,
  adservaudio: 0.4,
  brand_colour: DEFAULT_CLIENT_BRAND_COLOUR,
}

/** POST body for `/api/clients`. Never carries the legacy id* columns. */
export function buildAddClientPayload(data: ClientAddFormValues): Record<string, unknown> {
  const { clientname_input, ...restData } = data
  const payload: Record<string, unknown> = {
    ...restData,
    mp_client_name: clientname_input,
    client_name: clientname_input, // Xano input expects client_name mapped to mp_client_name
  }
  for (const field of LEGACY_PLATFORM_ID_FIELDS) {
    delete payload[field]
  }
  return payload
}
