export type BillingBurst = {
  startDate: Date;
  endDate:   Date;
  mediaAmount: number;       // NEW
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
  };
}; 