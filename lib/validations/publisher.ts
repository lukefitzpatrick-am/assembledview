import * as z from "zod"

const comms = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : 0
  })
  .pipe(z.number().min(0).max(100))

const publisherBooleanFields = {
  pub_television: z.boolean(),
  pub_radio: z.boolean(),
  pub_newspaper: z.boolean(),
  pub_magazines: z.boolean(),
  pub_ooh: z.boolean(),
  pub_cinema: z.boolean(),
  pub_digidisplay: z.boolean(),
  pub_digiaudio: z.boolean(),
  pub_digivideo: z.boolean(),
  pub_bvod: z.boolean(),
  pub_integration: z.boolean(),
  pub_search: z.boolean(),
  pub_socialmedia: z.boolean(),
  pub_progdisplay: z.boolean(),
  pub_progvideo: z.boolean(),
  pub_progbvod: z.boolean(),
  pub_progaudio: z.boolean(),
  pub_progooh: z.boolean(),
  pub_influencers: z.boolean(),
}

const publisherCommsFields = {
  radio_comms: comms,
  newspaper_comms: comms,
  television_comms: comms,
  magazines_comms: comms,
  ooh_comms: comms,
  cinema_comms: comms,
  digidisplay_comms: comms,
  digiaudio_comms: comms,
  digivideo_comms: comms,
  bvod_comms: comms,
  integration_comms: comms,
  search_comms: comms,
  socialmedia_comms: comms,
  progdisplay_comms: comms,
  progvideo_comms: comms,
  progbvod_comms: comms,
  progaudio_comms: comms,
  progooh_comms: comms,
  influencers_comms: comms,
}

const publisherColourField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === undefined || v === null) return null
    const s = String(v).trim()
    return s === "" ? null : s
  })

const publisherCoreFields = {
  publisher_name: z.string().min(1, "Publisher name is required"),
  publisherid: z.string().min(1, "Publisher ID is required"),
  publishertype: z.enum(["direct", "internal_biddable"]),
  billingagency: z.enum(["assembled media", "advertising associates"]),
  financecode: z.string().min(1, "Finance code is required"),
  publisher_colour: publisherColourField,
  ...publisherBooleanFields,
  ...publisherCommsFields,
}

export const publisherCreateSchema = z.object({
  ...publisherCoreFields,
})

export const publisherUpdateSchema = publisherCreateSchema.extend({
  id: z.number(),
})

/** Details + comms only (no KPI) for the collapsible publisher form */
export const publisherDetailsUpdateSchema = z.object({
  id: z.number(),
  ...publisherCoreFields,
})

export type PublisherCreateInput = z.input<typeof publisherCreateSchema>
export type PublisherCreateValues = z.infer<typeof publisherCreateSchema>
export type PublisherUpdateValues = z.infer<typeof publisherUpdateSchema>
export type PublisherDetailsInput = z.input<typeof publisherDetailsUpdateSchema>
export type PublisherDetailsFormValues = z.infer<typeof publisherDetailsUpdateSchema>
