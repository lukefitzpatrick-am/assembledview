const BASELINE_CTR = 0.001;  // 0.1% baseline click-through rate
const BASELINE_VTR = 0.25;   // 25% baseline view-through rate

export function computeAdServingCost(input: {
  quantity: number;
  buyType: string;
  mediaType: string;
  rate: number;
  adservaudio?: number | null;
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

  // Derive impressions from the deliverable by buy type.
  let impressions: number;
  switch (buyType) {
    case "cpm":
    case "bonus":
    case "package_inclusions":
      impressions = quantity;            // deliverable already impressions
      break;
    case "cpc":
      impressions = BASELINE_CTR > 0 ? quantity / BASELINE_CTR : 0;
      break;
    case "cpv":
      impressions = BASELINE_VTR > 0 ? quantity / BASELINE_VTR : 0;
      break;
    case "fixed_cost":
      impressions = 0;                   // no countable unit; Phase 2 manual entry
      break;
    default:
      impressions = 0;                   // unknown/unsupported -> no charge
  }

  return (impressions / 1000) * effectiveRate;
}
