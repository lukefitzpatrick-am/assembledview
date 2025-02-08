import * as z from "zod"

const createPublisherSchema = z.object({
  publisher_name: z.string().min(1, "Publisher name is required"),
  publisherid: z.string().min(1, "Publisher ID is required"),
  publishertype: z.enum(["direct", "internal biddable"]),
  billingagency: z.enum(["assembled media", "advertising associates"]),
  financecode: z.string().min(1, "Finance code is required"),
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
  radio_comms: z.number().min(0).max(100),
  newspaper_comms: z.number().min(0).max(100),
  television_comms: z.number().min(0).max(100),
  magazines_comms: z.number().min(0).max(100),
  ooh_comms: z.number().min(0).max(100),
  cinema_comms: z.number().min(0).max(100),
  digidisplay_comms: z.number().min(0).max(100),
  digiaudio_comms: z.number().min(0).max(100),
  digivideo_comms: z.number().min(0).max(100),
  bvod_comms: z.number().min(0).max(100),
  integration_comms: z.number().min(0).max(100),
  search_comms: z.number().min(0).max(100),
  progdisplay_comms: z.number().min(0).max(100),
  progvideo_comms: z.number().min(0).max(100),
  progbvod_comms: z.number().min(0).max(100),
  progaudio_comms: z.number().min(0).max(100),
  progooh_comms: z.number().min(0).max(100),
  influencers_comms: z.number().min(0).max(100),
})

const updatePublisherSchema = createPublisherSchema.extend({
  id: z.number(),
})

export const publisherSchema = createPublisherSchema
export const updatePublisherSchema = updatePublisherSchema

