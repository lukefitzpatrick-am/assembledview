const BASELINE_CTR = 0.001;  // 0.1% baseline click-through rate
const BASELINE_VTR = 0.25;   // 25% baseline view-through rate

export function computeAdServingCost(input: {
  quantity: number;
  buyType: string;
  mediaType: string;
  rate: number;
  adservaudio?: number | null;
  adServingRatePct?: number;
  adServingImpressions?: number;
  kpiCtr?: number | null;
  kpiVtr?: number | null;
}): number {
  const { quantity, mediaType, rate, adservaudio } = input;
  const buyType = input.buyType?.toLowerCase?.() || "";

  const isDigiAudio =
    typeof mediaType === "string" &&
    mediaType.toLowerCase().replace(/\s+/g, "") === "digiaudio";

  // DigiAudio cpm/bonus uses the audio rate; otherwise the passed rate.
  const isCpm = buyType === "cpm";
  const isBonus = buyType === "bonus";
  const effectiveRate =
    isDigiAudio && (isCpm || isBonus) ? (adservaudio ?? rate) : rate;

  // Stored overrides are manual-only human-facing percentages.
  const manualPct =
    input.adServingRatePct != null && input.adServingRatePct > 0
      ? input.adServingRatePct / 100
      : null;
  const ctrDecimal =
    manualPct ?? (input.kpiCtr != null && input.kpiCtr > 0 ? input.kpiCtr : BASELINE_CTR);
  const vtrDecimal =
    manualPct ?? (input.kpiVtr != null && input.kpiVtr > 0 ? input.kpiVtr : BASELINE_VTR);

  // Derive impressions from the deliverable by buy type.
  let impressions: number;
  switch (buyType) {
    case "cpm":
    case "bonus":
    case "package_inclusions":
      impressions = quantity;            // deliverable already impressions
      break;
    case "cpc":
      impressions = ctrDecimal > 0 ? quantity / ctrDecimal : 0;
      break;
    case "cpv":
      impressions = vtrDecimal > 0 ? quantity / vtrDecimal : 0;
      break;
    case "fixed_cost":
      impressions =
        input.adServingImpressions != null && input.adServingImpressions > 0
          ? input.adServingImpressions
          : 0;
      break;
    default:
      impressions = 0;                   // unknown/unsupported -> no charge
  }

  return (impressions / 1000) * effectiveRate;
}
