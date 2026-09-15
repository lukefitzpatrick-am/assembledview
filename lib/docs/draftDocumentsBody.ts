/**
 * Zod body for POST /api/mediaplans/draft-documents.
 * Save schema plus draft-only extras. masterId is optional (create has none).
 */
import { z } from "zod"

import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"

const clientAddressSchema = z
  .object({
    name: z.string().optional(),
    streetaddress: z.string().optional(),
    suburb: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
  })
  .optional()

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

export type DraftDocumentsBody = z.infer<typeof draftDocumentsBodySchema>
