export type ScheduleHeaders = { header1: string; header2: string };

// Small helper: first non-empty string-ish value
const pick = (...values: any[]): string => {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
};

/**
 * Normalize header1/header2 across media containers.
 *
 * Goal: both billingSchedule and deliverySchedule persist the same *detail*
 * headers regardless of container-specific field names.
 */
export function getScheduleHeaders(mediaType: string, lineItem: any): ScheduleHeaders {
  // Programmatic-ish containers (“platform + targeting” style ones)
  if (
    [
      "search",
      "socialMedia",
      "progDisplay",
      "progVideo",
      "progBvod",
      "progAudio",
      "progOoh",
    ].includes(mediaType)
  ) {
    const header1 = pick(lineItem?.platform, lineItem?.publisher, lineItem?.network);
    const header2 = pick(
      lineItem?.targeting,
      lineItem?.creativeTargeting,
      lineItem?.creative_targeting,
      lineItem?.targetingAttribute,
      lineItem?.targeting_attribute
    );
    return { header1, header2 };
  }

  switch (mediaType) {
    case "television": {
      return {
        header1: pick(lineItem?.network),
        header2: pick(lineItem?.station),
      };
    }
    case "radio": {
      return {
        header1: pick(lineItem?.network, lineItem?.platform),
        header2: pick(lineItem?.station, lineItem?.bid_strategy, lineItem?.bidStrategy),
      };
    }
    case "newspaper":
    case "magazines": {
      return {
        header1: pick(lineItem?.publisher, lineItem?.network),
        header2: pick(lineItem?.title),
      };
    }
    case "digiDisplay":
    case "digiAudio":
    case "digiVideo":
    case "bvod": {
      return {
        header1: pick(lineItem?.publisher),
        header2: pick(lineItem?.site),
      };
    }
    case "ooh": {
      return {
        header1: pick(lineItem?.network),
        header2: pick(lineItem?.format, lineItem?.oohFormat, lineItem?.ooh_format),
      };
    }
    case "cinema": {
      return {
        header1: pick(lineItem?.network),
        header2: pick(lineItem?.format, lineItem?.creative, lineItem?.station),
      };
    }
    case "production": {
      return {
        header1: pick(lineItem?.header1, "Production"),
        header2: pick(lineItem?.header2, "Total"),
      };
    }
    default: {
      return {
        header1: pick(lineItem?.network, lineItem?.publisher, lineItem?.platform, lineItem?.header1, "Item"),
        header2: pick(lineItem?.station, lineItem?.site, lineItem?.title, lineItem?.format, lineItem?.header2, "Details"),
      };
    }
  }
}

