export type BillingBurst = {
  startDate: Date;
  endDate:   Date;
  mediaAmount: number;       // NEW
  /**
   * Media amount for the delivery schedule (pacing). This can differ from `mediaAmount`
   * when the client pays for media: billing media is $0, but delivery media should remain.
   */
  deliveryMediaAmount?: number;
  feeAmount:   number;       // NEW
  totalAmount: number;       // keep for backwards-compatibility or remove if unused
  mediaType:   string;
  noAdserving: boolean;
  feePercentage: number;
  clientPaysForMedia: boolean;
  budgetIncludesFees:  boolean;
  deliverables: number;
  buyType: 'cpm' | 'cpc' | 'cpv' | 'fixed cost' | 'package' | 'insertion' | string;
};

export type BillingLineItem = {
  id: string; // Unique identifier for the line item
  header1: string; // First column header (Network/Platform/Publisher)
  header2: string; // Second column header (Station/Title/Site/Bid Strategy/Format)
  monthlyAmounts: Record<string, number>; // Month key -> amount for that month
  totalAmount: number;
  /**
   * Manual billing UI helper: if true, this line item is "pre-billed"
   * (all spend moved into the first billing month).
   */
  preBill?: boolean;
  /**
   * Manual billing UI helper: snapshot of monthlyAmounts before pre-bill was applied,
   * so unchecking can restore the previous distribution.
   */
  preBillSnapshot?: Record<string, number>;
};

export type BillingMonth = {
  monthYear: string; // e.g. 'January 2025'
  mediaTotal: string;
  feeTotal: string;
  totalAmount: string;
  adservingTechFees: string;
  production: string;
  mediaCosts: {
    search: string;
    socialMedia: string;
    television: string;
    radio: string;
    newspaper: string;
    magazines: string;
    ooh: string;
    cinema: string;
    digiDisplay: string;
    digiAudio: string;
    digiVideo: string;
    bvod: string;
    integration: string;
    progDisplay: string;
    progVideo: string;
    progBvod: string;
    progAudio: string;
    progOoh: string;
    influencers: string;
    production: string;
  };
  // Optional line item breakdowns for each media type
  lineItems?: {
    search?: BillingLineItem[];
    socialMedia?: BillingLineItem[];
    television?: BillingLineItem[];
    radio?: BillingLineItem[];
    newspaper?: BillingLineItem[];
    magazines?: BillingLineItem[];
    ooh?: BillingLineItem[];
    cinema?: BillingLineItem[];
    digiDisplay?: BillingLineItem[];
    digiAudio?: BillingLineItem[];
    digiVideo?: BillingLineItem[];
    bvod?: BillingLineItem[];
    integration?: BillingLineItem[];
    progDisplay?: BillingLineItem[];
    progVideo?: BillingLineItem[];
    progBvod?: BillingLineItem[];
    progAudio?: BillingLineItem[];
    progOoh?: BillingLineItem[];
    influencers?: BillingLineItem[];
    production?: BillingLineItem[];
  };
}; 