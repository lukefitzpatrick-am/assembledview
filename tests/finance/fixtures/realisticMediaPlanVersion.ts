/**
 * Fixture shapes aligned with Xano `media_plan_versions` as consumed by
 * `buildFinanceForecastDataset` (billing / delivery JSON, nested mediaTypes + lineItems).
 */

import type {
  FinanceForecastMediaPlanVersionInput,
  FinanceForecastPublisherInput,
} from "../../../lib/types/financeForecast.js"
import { PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA } from "../../../lib/finance/forecast/mapping/definitions.js"

/** Publisher row as typically joined for forecast builds. */
export function fixturePublisherAssembledMedia(
  overrides?: Partial<FinanceForecastPublisherInput> | Record<string, unknown>
): FinanceForecastPublisherInput {
  return {
    publisher_name: "Seven Network",
    billingagency: PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA,
    publishertype: "Standard",
    ...( { television_comms: 15 } as Record<string, unknown> ),
    ...overrides,
  } as FinanceForecastPublisherInput
}

/**
 * One campaign with a July-only TV burst in billingSchedule, optional delivery mirror,
 * FY2025-relevant dates, and snake_case schedule field to mirror API payloads.
 */
export function realisticMediaPlanVersionFy2025(overrides?: Partial<FinanceForecastMediaPlanVersionInput>): FinanceForecastMediaPlanVersionInput {
  const billingSchedule = [
    {
      monthYear: "2025-07",
      mediaTypes: [
        {
          mediaType: "Television",
          lineItems: [
            {
              lineItemId: "television-Seven Network--0",
              header1: "Seven Network",
              amount: 50_000,
              clientPaysForMedia: false,
            },
          ],
        },
      ],
    },
    {
      monthYear: "2025-08",
      feeTotal: 2500,
      assembledFee: 2500,
      adservingTechFees: 0,
      production: 0,
    },
  ]

  return {
    id: "version-fixture-001",
    mba_number: "MBA-REAL-001",
    version_number: 3,
    campaign_id: "camp-77",
    campaign_name: "FY25 Always On TV",
    mp_client_name: "Acme Retail AU",
    campaign_status: "approved",
    campaign_start_date: "2025-07-01",
    campaign_end_date: "2026-06-15",
    billingSchedule,
    /** Snake_case alias used by some Xano views — builder reads both. */
    billing_schedule: billingSchedule,
    /** Often empty when parity with billing; tests can inject competing rows for schedule priority. */
    delivery_schedule: [],
    ...overrides,
  }
}
