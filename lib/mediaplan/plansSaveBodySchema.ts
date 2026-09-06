/**
 * Zod body for POST /api/plans/save. The route handler parses with this
 * schema — unknown keys are stripped. Tests import this, not the route,
 * so they can prove optional keys survive without booting Auth0.
 */
import { z } from "zod"

import { LINE_CHANNELS } from "@/db/schema"

const monthAmountSchema = z.object({
  month: z.string().min(1),
  amount: z.number(),
})

const overrideSchema = z.object({
  mode: z.enum(["auto", "manual"]),
  reason: z.enum(["prepayment", "client_terms", "manual"]).optional(),
  months: z.array(monthAmountSchema),
  dateBasis: z.string(),
})

const feeOverrideSchema = z.object({
  mode: z.literal("manual"),
  reason: z.enum(["prepayment", "client_terms", "manual"]).optional(),
  months: z.array(monthAmountSchema),
  dateBasis: z.string(),
  component: z.literal("fee").optional(),
})

const lineItemSchema = z.object({
  lineItemId: z.string().min(1),
  channel: z.enum(LINE_CHANNELS as unknown as [string, ...string[]]),
  position: z.number().int().nullable().optional(),
  market: z.string().nullable().optional(),
  buyingDemo: z.string().nullable().optional(),
  buyType: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  bidStrategy: z.string().nullable().optional(),
  fixedCostMedia: z.boolean().nullable().optional(),
  clientPaysForMedia: z.boolean().nullable().optional(),
  budgetIncludesFees: z.boolean().nullable().optional(),
  noAdserving: z.boolean().nullable().optional(),
  bursts: z.unknown(),
  attrs: z.record(z.string(), z.unknown()).nullable().optional(),
  mediaType: z.string().min(1),
  rate: z.number(),
  enteredAmount: z.number(),
  feePct: z.number().optional(),
  approval: z.enum(["approved", "excluded"]).optional(),
  label: z.string().optional(),
  billingOverride: overrideSchema.optional(),
  feeOverride: feeOverrideSchema.optional(),
})

const ensureMasterSchema = z.object({
  mbaNumber: z.string().min(1),
  mpClientName: z.string().nullable().optional(),
  campaignName: z.string().nullable().optional(),
  campaignStatus: z.string().nullable().optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignEndDate: z.string().nullable().optional(),
  campaignBudgetCents: z.number().int().nullable().optional(),
  clientId: z.number().int().positive().nullable().optional(),
})

export const plansSaveBodySchema = z.object({
  masterId: z.number().int().positive(),
  mbaNumber: z.string().min(1),
  versionNumber: z.number().int().positive(),
  mode: z.enum(["draft", "new_version", "publish"]),
  campaignName: z.string().nullable().optional(),
  campaignStatus: z.string().nullable().optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignEndDate: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  clientContact: z.string().nullable().optional(),
  poNumber: z.string().nullable().optional(),
  campaignBudgetCents: z.number().int().nullable().optional(),
  fixedFee: z.boolean().nullable().optional(),
  channelFlags: z.record(z.string(), z.unknown()).nullable().optional(),
  mediaPlanFile: z.unknown().optional(),
  mbaPdfFile: z.unknown().optional(),
  aaMediaPlanFile: z.unknown().optional(),
  lineItems: z.array(lineItemSchema),
  feeLoading: z.record(z.string(), z.number()),
  feeSnapshot: z.record(z.string(), z.unknown()).optional(),
  adservaudio: z.number().optional(),
  adservvideo: z.number().optional(),
  adservdisplay: z.number().optional(),
  adservimp: z.number().optional(),
  /** Month chips at approve/publish — drives approved_slice. */
  selectedMonthYears: z.array(z.string()).optional(),
  /** O4 — working billing snapshot for AUTO correction toast (not authoritative). */
  clientBillingSchedulePreview: z.array(z.any()).optional().nullable(),
  /**
   * MB-25 — override REPLACE-SET intent.
   * authoritative:true only after a successful billing_overrides GET.
   * Missing → treated as not authoritative (skip REPLACE-SET).
   */
  billingOverrides: z
    .object({
      authoritative: z.boolean(),
      clearedLineIds: z.array(z.string()),
    })
    .optional()
    .nullable(),
  /** Safety net only (X9): master should already exist from POST /api/mediaplans. */
  ensureMaster: ensureMasterSchema.optional(),
  /** PC7: version this cut is forked from (loaded editor version). */
  baseVersionId: z.number().int().positive().optional().nullable(),
  /**
   * Staged ingest to complete after a successful save. Optional — ordinary
   * saves omit it. Zod must not strip this (C-21 class trap).
   */
  ingestStageId: z.string().min(1).optional(),
  /**
   * SV-1: published pointer the editor saw at load. Stale-base 409 compares
   * this to the current pointer — not `baseVersionId` (the version being forked).
   * Null on create.
   */
  tipVersionIdAtLoad: z.number().int().positive().optional().nullable(),
})
