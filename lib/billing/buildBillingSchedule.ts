import type { BillingMonth, BillingLineItem } from './types';

type BillingScheduleLineItem = {
  lineItemId: string;
  header1: string;
  header2: string;
  amount: string;
};

type BillingScheduleMediaType = {
  mediaType: string;
  lineItems: BillingScheduleLineItem[];
};

export type BillingScheduleEntry = {
  monthYear: string;
  mediaTypes: BillingScheduleMediaType[];
  adservingTechFees?: string;
  production?: string;
  feeTotal?: string;
};

const mediaTypeLabels: Record<string, string> = {
  search: 'Search',
  socialMedia: 'Social Media',
  television: 'Television',
  radio: 'Radio',
  newspaper: 'Newspaper',
  magazines: 'Magazines',
  ooh: 'OOH',
  cinema: 'Cinema',
  digiDisplay: 'Digital Display',
  digiAudio: 'Digital Audio',
  digiVideo: 'Digital Video',
  bvod: 'BVOD',
  integration: 'Integration',
  progDisplay: 'Programmatic Display',
  progVideo: 'Programmatic Video',
  progBvod: 'Programmatic BVOD',
  progAudio: 'Programmatic Audio',
  progOoh: 'Programmatic OOH',
  influencers: 'Influencers',
  production: 'Production',
};

const currencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseMoney(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function coerceMoneyString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) {
    return currencyFormatter.format(value)
  }
  return String(value)
}

/**
 * Transforms BillingMonth[] data into the required hierarchy:
 * Month → Media Types → Line Items (header1, header2, $ amount)
 * Filters out media types (containers) and line items with $0.00 spend
 */
export function buildBillingScheduleJSON(billingMonths: BillingMonth[]): BillingScheduleEntry[] {
  if (!billingMonths || billingMonths.length === 0) {
    return [];
  }

  return billingMonths.reduce<BillingScheduleEntry[]>((acc, month) => {
    // Process even if there are no line items, as we may have fee/ad serving data
    const hasLineItems = month.lineItems && Object.keys(month.lineItems).length > 0;
    const hasFeeOrAdServing =
      parseMoney((month as any).feeTotal) !== 0 ||
      parseMoney((month as any).adservingTechFees) !== 0 ||
      parseMoney((month as any).production) !== 0;
    
    if (!hasLineItems && !hasFeeOrAdServing) {
      return acc;
    }

    const mediaTypes: BillingScheduleMediaType[] = [];

    Object.entries(month.lineItems ?? {}).forEach(([mediaKey, lineItems]) => {
      if (!lineItems || lineItems.length === 0) {
        return;
      }

      const formattedLineItems: BillingScheduleLineItem[] = lineItems
        .map((item: BillingLineItem) => {
          const amountValue = item.monthlyAmounts?.[month.monthYear] || 0;

          return {
            lineItemId: item.id,
            header1: item.header1,
            header2: item.header2,
            amount: currencyFormatter.format(amountValue),
            __amountValue: amountValue,
          };
        })
        .filter(item => item.__amountValue > 0)
        .map(({ __amountValue, ...rest }) => rest);

      if (formattedLineItems.length > 0) {
        mediaTypes.push({
          mediaType: mediaTypeLabels[mediaKey] ?? mediaKey,
          lineItems: formattedLineItems,
        });
      }
    });

    // Build the entry with media types and optional fee/ad serving fields
    const entry: BillingScheduleEntry = {
      monthYear: month.monthYear,
      mediaTypes,
    };

    // Include feeTotal if present and not empty/zero
    const feeTotalValue = coerceMoneyString((month as any).feeTotal)
    if (feeTotalValue && feeTotalValue.trim() !== "" && parseMoney((month as any).feeTotal) !== 0) {
      entry.feeTotal = feeTotalValue
    }

    // Include adservingTechFees if present and not empty/zero
    const adservingValue = coerceMoneyString((month as any).adservingTechFees)
    if (adservingValue && adservingValue.trim() !== "" && parseMoney((month as any).adservingTechFees) !== 0) {
      entry.adservingTechFees = adservingValue
    }

    // Include production if present and not empty/zero
    const productionValue = coerceMoneyString((month as any).production)
    if (productionValue && productionValue.trim() !== "" && parseMoney((month as any).production) !== 0) {
      entry.production = productionValue
    }

    // Only add entry if it has media types or fee/ad serving data
    if (mediaTypes.length > 0 || entry.feeTotal || entry.adservingTechFees || entry.production) {
      acc.push(entry);
    }

    return acc;
  }, []);
}


