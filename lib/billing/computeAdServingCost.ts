export function computeAdServingCost(input: {
  quantity: number;
  buyType: string;
  mediaType: string;
  rate: number;
  adservaudio?: number | null;
}): number {
  const { quantity, mediaType, rate, adservaudio } = input;
  const buyType = input.buyType?.toLowerCase?.() || "";
  const isCpm = buyType === "cpm";
  const isBonus = buyType === "bonus";
  const isDigiAudio =
    typeof mediaType === "string" &&
    mediaType.toLowerCase().replace(/\s+/g, "") === "digiaudio";
  const isCpmOrBonusForDigiAudio = isDigiAudio && (isCpm || isBonus);
  const effectiveRate = isCpmOrBonusForDigiAudio ? (adservaudio ?? rate) : rate;
  return isCpmOrBonusForDigiAudio
    ? (quantity / 1000) * effectiveRate
    : isCpm
      ? (quantity / 1000) * rate
      : quantity * rate;
}
