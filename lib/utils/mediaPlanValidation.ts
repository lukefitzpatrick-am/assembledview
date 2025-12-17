/**
 * Utility function to check if any media placement dates fall outside campaign dates
 * @param campaignStartDate - Campaign start date
 * @param campaignEndDate - Campaign end date
 * @param allMediaLineItems - Object containing all media line item arrays
 * @returns true if any dates are outside campaign range, false otherwise
 */
export function checkMediaDatesOutsideCampaign(
  campaignStartDate: Date | null | undefined,
  campaignEndDate: Date | null | undefined,
  allMediaLineItems: {
    televisionMediaLineItems?: any[];
    radioMediaLineItems?: any[];
    newspaperMediaLineItems?: any[];
    magazineMediaLineItems?: any[];
    oohMediaLineItems?: any[];
    cinemaMediaLineItems?: any[];
    digiDisplayMediaLineItems?: any[];
    digiAudioMediaLineItems?: any[];
    digiVideoMediaLineItems?: any[];
    bvodMediaLineItems?: any[];
    integrationMediaLineItems?: any[];
    searchMediaLineItems?: any[];
    socialMediaMediaLineItems?: any[];
    progDisplayMediaLineItems?: any[];
    progVideoMediaLineItems?: any[];
    progBvodMediaLineItems?: any[];
    progAudioMediaLineItems?: any[];
    progOohMediaLineItems?: any[];
    influencersMediaLineItems?: any[];
  }
): boolean {
  // If campaign dates are not set, return false (no warning)
  if (!campaignStartDate || !campaignEndDate) {
    return false;
  }

  // Normalize campaign dates to date-only (ignore time)
  const campaignStart = new Date(campaignStartDate);
  campaignStart.setHours(0, 0, 0, 0);
  const campaignEnd = new Date(campaignEndDate);
  campaignEnd.setHours(23, 59, 59, 999);

  // Helper function to parse a date from various formats
  const parseDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    
    if (dateValue instanceof Date) {
      return dateValue;
    }
    
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    
    return null;
  };

  // Helper function to check if a date is outside campaign range
  const isDateOutsideRange = (date: Date | null): boolean => {
    if (!date) return false;
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    return normalizedDate < campaignStart || normalizedDate > campaignEnd;
  };

  // Helper function to extract and check bursts from a line item
  const checkLineItemBursts = (lineItem: any): boolean => {
    if (!lineItem) return false;

    let bursts: any[] = [];

    // Try to get bursts from bursts_json (string or array)
    if (lineItem.bursts_json) {
      if (typeof lineItem.bursts_json === 'string') {
        try {
          const parsed = JSON.parse(lineItem.bursts_json);
          bursts = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          // If parsing fails, try to use it as-is
          if (Array.isArray(lineItem.bursts_json)) {
            bursts = lineItem.bursts_json;
          }
        }
      } else if (Array.isArray(lineItem.bursts_json)) {
        bursts = lineItem.bursts_json;
      }
    }

    // Also check for bursts field (some containers use this)
    if (lineItem.bursts && Array.isArray(lineItem.bursts)) {
      bursts = lineItem.bursts;
    }

    // Check each burst's start and end dates
    for (const burst of bursts) {
      if (!burst) continue;

      const startDate = parseDate(burst.startDate);
      const endDate = parseDate(burst.endDate);

      if (isDateOutsideRange(startDate) || isDateOutsideRange(endDate)) {
        return true;
      }
    }

    return false;
  };

  // Check all media line item arrays
  const mediaArrays = [
    allMediaLineItems.televisionMediaLineItems,
    allMediaLineItems.radioMediaLineItems,
    allMediaLineItems.newspaperMediaLineItems,
    allMediaLineItems.magazineMediaLineItems,
    allMediaLineItems.oohMediaLineItems,
    allMediaLineItems.cinemaMediaLineItems,
    allMediaLineItems.digiDisplayMediaLineItems,
    allMediaLineItems.digiAudioMediaLineItems,
    allMediaLineItems.digiVideoMediaLineItems,
    allMediaLineItems.bvodMediaLineItems,
    allMediaLineItems.integrationMediaLineItems,
    allMediaLineItems.searchMediaLineItems,
    allMediaLineItems.socialMediaMediaLineItems,
    allMediaLineItems.progDisplayMediaLineItems,
    allMediaLineItems.progVideoMediaLineItems,
    allMediaLineItems.progBvodMediaLineItems,
    allMediaLineItems.progAudioMediaLineItems,
    allMediaLineItems.progOohMediaLineItems,
    allMediaLineItems.influencersMediaLineItems,
  ];

  // Check each media type's line items
  for (const mediaArray of mediaArrays) {
    if (!Array.isArray(mediaArray)) continue;

    for (const lineItem of mediaArray) {
      if (checkLineItemBursts(lineItem)) {
        return true;
      }
    }
  }

  return false;
}













































































