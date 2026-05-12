/**
 * Centralised channel form schemas (Domain 3a — Stage 3).
 *
 * Single source of truth for all 19 media-channel form schemas. Containers
 * import the channel-specific named schemas + types from here instead of
 * declaring them inline.
 *
 * Design (locked Stage 3):
 *   - `baseBurstSchema`               — shared by 18/19 channels
 *   - `televisionBurstSchema`         — Television's extended burst (size, tarps,
 *                                       custom error messages, plus a .refine()
 *                                       guarding endDate >= startDate)
 *   - Per-channel `<channel>lineItemSchema` and `<channel>FormSchema` —
 *     composed from shared shape pieces (`lineItemTotalsShape`, `lineItemIdFields`)
 *     plus the channel's own fields. Field-level Zod constraints are preserved
 *     exactly as they were declared inline in each Container, so no validation
 *     behaviour changes.
 *
 * Excluded from centralisation:
 *   - ProductionContainer — burst uses `cost`/`amount: z.number()` rather than
 *     `budget`/`buyAmount: z.string()`, and the line item shape is unrelated
 *     (mediaType/publisher/description). Production keeps its own inline schemas.
 */

import * as z from "zod"

// ============================================================================
// Shared shape pieces (composed via object spread into channel schemas)
// ============================================================================

/**
 * Common burst fields shared by every channel except Television.
 * Television extends this with `size` + `tarps` plus a refined endDate guard.
 */
const baseBurstShape = {
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  mediaAmount: z.union([z.string(), z.number()]).optional(),
  feeAmount: z.union([z.string(), z.number()]).optional(),
  fee: z.number().optional(),
} as const

/** Universal line item totals appearing on every channel. */
const lineItemTotalsShape = {
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
} as const

/**
 * The 4-variant line-item-id field family carried by the print/AV channels
 * (TV, Newspaper, Magazines, Cinema, OOH, Radio).
 */
const lineItemIdFields = {
  lineItemId: z.string().optional(),
  line_item_id: z.string().optional(),
  line_item: z.union([z.string(), z.number()]).optional(),
  lineItem: z.union([z.string(), z.number()]).optional(),
} as const

// ============================================================================
// Burst schemas
// ============================================================================

/** Shared burst schema used by all channels except Television. */
export const baseBurstSchema = z.object(baseBurstShape)

/**
 * Television burst schema — extends the base with size + tarps,
 * preserves Television's specific error messages, and refines that
 * endDate >= startDate. Note: once refined, `.extend()` is no longer
 * available, so the array of TV bursts in the line item schema below
 * still references this refined value (z.array() doesn't care).
 */
export const televisionBurstSchema = z
  .object({
    ...baseBurstShape,
    budget: z.string().min(1, "Budget for this burst is required"),
    buyAmount: z.string().min(1, "Buy Amount for this burst is required"),
    startDate: z.date({ message: "Start date for this burst is required." }),
    endDate: z.date({ message: "End date for this burst is required." }),
    size: z.string().min(1, "Ad Size/Length for this burst is required"),
    tarps: z
      .string()
      .min(1, "TARPs for this burst are required")
      .regex(/^\d+(\.\d+)?$/, "TARPs must be a number"),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date cannot be earlier than start date",
    path: ["endDate"],
  })

// Per-channel burst aliases (most are simply baseBurstSchema, exported with the
// channel-specific name preserved from the original Container declarations so
// that imports can stay textually obvious).

export const digidisplayburstSchema = baseBurstSchema
export const digiaudioburstSchema = baseBurstSchema
export const digivideoBurstSchema = baseBurstSchema
export const bvodburstSchema = baseBurstSchema
export const newspaperburstSchema = baseBurstSchema
export const magazinesburstSchema = baseBurstSchema
export const oohburstSchema = baseBurstSchema
export const cinemaBurstSchema = baseBurstSchema
export const searchBurstSchema = baseBurstSchema
export const radioBurstSchema = baseBurstSchema
export const socialMediaBurstSchema = baseBurstSchema
export const influencersBurstSchema = baseBurstSchema
export const integrationBurstSchema = baseBurstSchema
export const progDisplayBurstSchema = baseBurstSchema
export const progVideoBurstSchema = baseBurstSchema
export const progBvodBurstSchema = baseBurstSchema
export const progAudioBurstSchema = baseBurstSchema
export const progOOHBurstSchema = baseBurstSchema
// televisionBurstSchema is exported above (refined variant).

// ============================================================================
// Line item schemas
// ============================================================================

// --- Digital Display ---------------------------------------------------------

export const digidisplaylineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  site: z.string().min(1, "Site is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  publisher: z.string().min(1, "Publisher is required"),
  creativeTargeting: z.string().min(1, "Creative Targeting is required"),
  creative: z.string().min(1, "Creative is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  bursts: z.array(digidisplayburstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Digital Audio -----------------------------------------------------------

export const digiaudiolineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  site: z.string().min(1, "Site is required"),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  publisher: z.string().min(1, "Publisher is required"),
  targetingAttribute: z.string(),
  creativeTargeting: z.string().min(1, "Creative Targeting is required"),
  creative: z.string().min(1, "Creative is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  bursts: z.array(digiaudioburstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Digital Video -----------------------------------------------------------

export const digivideoLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  site: z.string().min(1, "Site is required"),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  publisher: z.string().min(1, "Publisher is required"),
  placement: z.string(),
  size: z.string(),
  targetingAttribute: z.string(),
  creativeTargeting: z.string().min(1, "Creative Targeting is required"),
  creative: z.string().min(1, "Creative is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  bursts: z.array(digivideoBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- BVOD --------------------------------------------------------------------

export const bvodlineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  site: z.string().min(1, "Site is required"),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  publisher: z.string().min(1, "Publisher is required"),
  creativeTargeting: z.string().min(1, "Creative Targeting is required"),
  creative: z.string().min(1, "Creative is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  bursts: z.array(bvodburstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Television --------------------------------------------------------------

export const televisionlineItemSchema = z.object({
  market: z.string().min(1, "Market is required"),
  network: z.string().min(1, "Network is required"),
  station: z.string().min(1, "Station is required"),
  daypart: z.string().min(1, "Daypart is required"),
  placement: z.string().min(1, "Placement is required"),
  bidStrategy: z.string().default("").optional(),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().default("").optional(),
  creative: z.string().default("").optional(),
  buyingDemo: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  ...lineItemIdFields,
  bursts: z.array(televisionBurstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
})

// --- Newspaper ---------------------------------------------------------------

export const newspaperlineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  publisher: z.string().optional().default(""),
  title: z.string().min(1, "Title is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  size: z.string().min(1, "Size is required"),
  format: z.string().optional().default(""),
  placement: z.string().min(1, "Placement is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  ...lineItemIdFields,
  bursts: z.array(newspaperburstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Magazines ---------------------------------------------------------------

export const magazineslineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  title: z.string().min(1, "Title is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  size: z.string().min(1, "Size is required"),
  publisher: z.string(),
  placement: z.string(),
  buyingDemo: z.string(),
  market: z.string(),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  ...lineItemIdFields,
  bursts: z.array(magazinesburstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- OOH ---------------------------------------------------------------------
// Note: OOH uses `noAdserving` (camelCase A) instead of `noadserving`.

export const oohlineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  format: z.string().min(1, "Format is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  type: z.string().min(1, "Type is required"),
  placement: z.string().default(""),
  size: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  ...lineItemIdFields,
  bursts: z.array(oohburstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  noAdserving: z.boolean().default(false),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

// --- Cinema ------------------------------------------------------------------

export const cinemaLineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  station: z.string().min(1, "Station is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  bidStrategy: z.string().default(""),
  placement: z.string().min(1, "Placement is required"),
  format: z.string().min(1, "Format is required"),
  duration: z.string().min(1, "Duration is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  ...lineItemIdFields,
  bursts: z.array(cinemaBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Search ------------------------------------------------------------------

export const searchLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().optional().default(""),
  creative: z.string().optional().default(""),
  buyingDemo: z.string().optional().default(""),
  market: z.string().optional().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(searchBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Radio -------------------------------------------------------------------

export const radioLineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  station: z.string().min(1, "Station is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  bidStrategy: z.string().default("").optional(),
  placement: z.string().default(""),
  format: z.string().default(""),
  duration: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  platform: z.string().default(""),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  ...lineItemIdFields,
  bursts: z.array(radioBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Social Media ------------------------------------------------------------

export const socialMediaLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(socialMediaBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Influencers -------------------------------------------------------------

export const influencersLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  objective: z.string(),
  campaign: z.string(),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  targetingAttribute: z.string(),
  creativeTargeting: z.string(),
  creative: z.string(),
  buyingDemo: z.string(),
  market: z.string(),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  bursts: z.array(influencersBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Integration -------------------------------------------------------------
// Note: Integration uses `noAdserving` (camelCase A) instead of `noadserving`.

export const integrationLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  objective: z.string().default(""),
  campaign: z.string().default(""),
  targetingAttribute: z.string().default(""),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noAdserving: z.boolean().default(false),
  bursts: z.array(integrationBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Programmatic Display ----------------------------------------------------

export const progDisplayLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  site: z.string().default(""),
  placement: z.string().default(""),
  size: z.string().default(""),
  targetingAttribute: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(progDisplayBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Programmatic Video ------------------------------------------------------

export const progVideoLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  site: z.string().default(""),
  placement: z.string().default(""),
  size: z.string().default(""),
  targetingAttribute: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(progVideoBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Programmatic BVOD -------------------------------------------------------

export const progBvodLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(progBvodBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Programmatic Audio ------------------------------------------------------

export const progAudioLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  site: z.string().default(""),
  placement: z.string().default(""),
  targetingAttribute: z.string().default(""),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(progAudioBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// --- Programmatic OOH --------------------------------------------------------

export const progOOHLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  environment: z.string().default(""),
  format: z.string().default(""),
  location: z.string().default(""),
  targetingAttribute: z.string().default(""),
  placement: z.string().default(""),
  size: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(progOOHBurstSchema).min(1, "At least one burst is required"),
  ...lineItemTotalsShape,
})

// ============================================================================
// Form schemas + inferred types
// ============================================================================

// --- Digital Display ---------------------------------------------------------
export const digidisplayFormSchema = z.object({
  digidisplaylineItems: z.array(digidisplaylineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type DigiDisplayFormValues = z.infer<typeof digidisplayFormSchema>

// --- Digital Audio -----------------------------------------------------------
export const digiAudioFormSchema = z.object({
  digiaudiolineItems: z.array(digiaudiolineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type DigiAudioFormValues = z.infer<typeof digiAudioFormSchema>

// --- Digital Video -----------------------------------------------------------
export const digivideoFormSchema = z.object({
  digivideolineItems: z.array(digivideoLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type DigiVideoFormValues = z.infer<typeof digivideoFormSchema>

// --- BVOD --------------------------------------------------------------------
export const bvodFormSchema = z.object({
  bvodlineItems: z.array(bvodlineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type BVODFormValues = z.infer<typeof bvodFormSchema>

// --- Television --------------------------------------------------------------
export const televisionFormSchema = z.object({
  televisionlineItems: z.array(televisionlineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type TelevisionFormValues = z.infer<typeof televisionFormSchema>

// --- Newspaper ---------------------------------------------------------------
export const newspapersFormSchema = z.object({
  newspaperlineItems: z.array(newspaperlineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type NewspapersFormValues = z.infer<typeof newspapersFormSchema>

// --- Magazines ---------------------------------------------------------------
export const magazinesFormSchema = z.object({
  magazineslineItems: z.array(magazineslineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type MagazinesFormValues = z.infer<typeof magazinesFormSchema>

// --- OOH ---------------------------------------------------------------------
export const oohFormSchema = z.object({
  lineItems: z.array(oohlineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type OohFormValues = z.infer<typeof oohFormSchema>

// --- Cinema ------------------------------------------------------------------
export const cinemaFormSchema = z.object({
  cinemalineItems: z.array(cinemaLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type CinemaFormValues = z.infer<typeof cinemaFormSchema>

// --- Search ------------------------------------------------------------------
export const searchFormSchema = z.object({
  lineItems: z.array(searchLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type SearchFormValues = z.infer<typeof searchFormSchema>

// --- Radio -------------------------------------------------------------------
export const radioFormSchema = z.object({
  radiolineItems: z.array(radioLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type RadioFormValues = z.infer<typeof radioFormSchema>

// --- Social Media ------------------------------------------------------------
export const socialMediaFormSchema = z.object({
  lineItems: z.array(socialMediaLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type SocialMediaFormValues = z.infer<typeof socialMediaFormSchema>

// --- Influencers -------------------------------------------------------------
export const influencersFormSchema = z.object({
  lineItems: z.array(influencersLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type InfluencersFormValues = z.infer<typeof influencersFormSchema>

// --- Integration -------------------------------------------------------------
export const integrationFormSchema = z.object({
  lineItems: z.array(integrationLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type IntegrationFormValues = z.infer<typeof integrationFormSchema>

// --- Programmatic Display ----------------------------------------------------
export const progDisplayFormSchema = z.object({
  lineItems: z.array(progDisplayLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type ProgDisplayFormValues = z.infer<typeof progDisplayFormSchema>

// --- Programmatic Video ------------------------------------------------------
export const progVideoFormSchema = z.object({
  lineItems: z.array(progVideoLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type ProgVideoFormValues = z.infer<typeof progVideoFormSchema>

// --- Programmatic BVOD -------------------------------------------------------
export const progBvodFormSchema = z.object({
  lineItems: z.array(progBvodLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type ProgBvodFormValues = z.infer<typeof progBvodFormSchema>

// --- Programmatic Audio ------------------------------------------------------
export const progAudioFormSchema = z.object({
  lineItems: z.array(progAudioLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type ProgAudioFormValues = z.infer<typeof progAudioFormSchema>

// --- Programmatic OOH --------------------------------------------------------
export const progOOHFormSchema = z.object({
  lineItems: z.array(progOOHLineItemSchema),
  overallDeliverables: z.number().optional(),
})
export type ProgOOHFormValues = z.infer<typeof progOOHFormSchema>
