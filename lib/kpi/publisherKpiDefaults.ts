import type { PublisherKpiInput } from "./types"

/** Unset publisher KPI metrics — null means "no target", never default to 0. */
export function emptyPublisherKpiMetricDefaults(): Pick<
  PublisherKpiInput,
  "ctr" | "cpv" | "conversion_rate" | "vtr" | "frequency"
> {
  return {
    ctr: null,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
  }
}

export function emptyPublisherKpiInput(
  publisherKey: string,
  overrides?: Partial<PublisherKpiInput>,
): PublisherKpiInput {
  return {
    publisher: publisherKey,
    media_type: "",
    bid_strategy: "",
    ...emptyPublisherKpiMetricDefaults(),
    ...overrides,
  }
}
