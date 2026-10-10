/**
 * Zod body for POST /api/mediaplans/draft-documents.
 * Save schema plus draft-only extras. masterId is optional (create has none).
 */
import { z } from "zod"

import { END_BEFORE_START_MESSAGE, endIsBeforeStart } from "@/lib/mediaplan/dateOrder"
import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"

/** Null from a client row becomes undefined before renderDraftDocuments. */
const addressField = z
  .string()
  .nullish()
  .transform((value): string | undefined => value ?? undefined)

const clientAddressSchema = z
  .object({
    name: addressField,
    streetaddress: addressField,
    suburb: addressField,
    state: addressField,
    postcode: addressField,
  })
  .nullish()
  .transform((value) => value ?? undefined)

const partialMbaSchema = z
  .object({
    selectedMonthYears: z.array(z.string()).optional(),
    approvedLineItemIds: z.array(z.string()).optional(),
  })
  .optional()

export const draftDocumentsBodySchema = plansSaveBodySchema
  .omit({ masterId: true })
  .extend({
    masterId: z.number().int().positive().optional().nullable(),
    kind: z.enum(["mba_pdf", "media_plan", "aa_media_plan"]),
    clientAddress: clientAddressSchema,
    partialMba: partialMbaSchema,
    kpiRows: z.array(z.record(z.string(), z.unknown())).optional(),
    publishers: z.array(z.any()).optional(),
  })
  .superRefine((data, ctx) => {
    if (!endIsBeforeStart(data.campaignStartDate, data.campaignEndDate)) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["campaignEndDate"],
      message: END_BEFORE_START_MESSAGE,
    })
  })

export type DraftDocumentsBody = z.infer<typeof draftDocumentsBodySchema>
