import * as z from "zod"

const optionalString = z.string().optional().or(z.literal(""))
const normalizeAbn = (value: string) => value.replace(/[^A-Za-z0-9]/g, "")

const clientSchema = z.object({
  id: z.number(),
  clientname_input: z.string().min(1, "Client name is required"),
  mbaidentifier: z.string().min(1, "MBA Identifier is required"),
  clientcategory: optionalString,
  abn: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return ""
      if (typeof val === "string") return normalizeAbn(val)
      return val
    },
    z
      .string()
      .regex(/^[A-Za-z0-9]{11}$/, "ABN must contain 11 letters or numbers after removing spaces or symbols")
      .optional()
      .or(z.literal(""))
  ),
  legalbusinessname: optionalString,
  streetaddress: optionalString,
  suburb: optionalString,
  state_dropdown: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT"]).optional(),
  postcode: z.number().int().min(1000).max(9999).optional(),
  payment_days: z.number().int().positive("Payment days must be a positive whole number").optional(),
  payment_terms: optionalString,
  keyfirstname: optionalString,
  keylastname: optionalString,
  keyphone: optionalString,
  keyemail: z.string().email().optional().or(z.literal("")),
  billingfirstname: optionalString,
  billinglastname: optionalString,
  billingphone: optionalString,
  billingemail: z.string().email().optional().or(z.literal("")),
  monthlyretainer: z.number().nonnegative().optional(),
  organicsocial: z.number().nonnegative().optional(),
  television_checkbox: z.boolean().optional(),
  radio_checkbox: z.boolean().optional(),
  newspapers_checkbox: z.boolean().optional(),
  magazines_checkbox: z.boolean().optional(),
  ooh_checkbox: z.boolean().optional(),
  cinema_checkbox: z.boolean().optional(),
  digitaldisplay_checkbox: z.boolean().optional(),
  digitalaudio_checkbox: z.boolean().optional(),
  digitalvideo_checkbox: z.boolean().optional(),
  bvod_checkbox: z.boolean().optional(),
  feesocial: z.number().nonnegative().optional(),
  feesearch: z.number().nonnegative().optional(),
  feeprogdisplay: z.number().nonnegative().optional(),
  feeprogvideo: z.number().nonnegative().optional(),
  feeprogbvod: z.number().nonnegative().optional(),
  feeprogaudio: z.number().nonnegative().optional(),
  feeprogooh: z.number().nonnegative().optional(),
  feecontentcreator: z.number().nonnegative().optional(),
  adservvideo: z.number().nonnegative().optional(),
  adservimp: z.number().nonnegative().optional(),
  adservdisplay: z.number().nonnegative().optional(),
  adservaudio: z.number().nonnegative().optional(),
  idgoogleads: optionalString,
  idmeta: optionalString,
  idcm360: optionalString,
  iddv360: optionalString,
  idtiktok: optionalString,
  idlinkedin: optionalString,
  idpinterest: optionalString,
  idquantcast: optionalString,
  idtaboola: optionalString,
  idsnapchat: optionalString,
  idbing: optionalString,
  idvistar: optionalString,
  idga4: optionalString,
  idmerchantcentre: optionalString,
  idshopify: optionalString,
  brand_colour: z
    .string()
    .regex(/^#?[0-9A-Fa-f]{6}$/, "Brand colour must be a valid 6-digit hex code (e.g. #49C7EB)")
    .optional()
    .or(z.literal("")),
})

export const clientSchema = clientSchema

