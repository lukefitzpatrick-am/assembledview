export interface DailyBilling {
  date: string;
  mediaTypeAmounts: {
    [mediaType: string]: {
      media: number;
      fee: number;
      isOverridden: boolean;
      manualMediaAmount: number | null;
      manualFeeAmount: number | null;
    };
  };
  totalAmount: number;
}

export interface MediaTypeAmounts {
  media: number;
  fee: number;
  isOverridden: boolean;
  manualMediaAmount: number | null;
  manualFeeAmount: number | null;
}

export interface BillingMonth {
  monthYear: string; // Format: 'YYYY-MM'
  mediaTypeAmounts: {
    [key: string]: MediaTypeAmounts;
  };
  totalAmount: number; // Total amount for the month (sum of all media and fees)
}

export interface BillingOverride {
  monthYear: string;
  mediaType: string;
  manualMediaAmount: number | null;
  manualFeeAmount: number | null;
}

export type BillingScheduleType = {
  month: string;
  searchAmount: number;
  socialAmount: number;
  feeAmount: number;
  totalAmount: number;
}[];

export interface BillingSchedule {
  months: BillingMonth[];
  overrides: BillingOverride[];
  isManual: boolean;
  campaignId: string;
} 