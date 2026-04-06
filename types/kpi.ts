export interface PublisherKPI {
  id: number;
  created_at: number;
  publisher: string; // platform/network identifier e.g. "dav360", "meta", "nine"
  bid_strategy: string; // e.g. "clicks", "cpm", "reach"
  ctr: number; // decimal e.g. 0.08
  cpv: number; // e.g. 0.06
  conversion_rate: number;
  vtr: number;
  frequency: number;
  media_type: string; // e.g. "progDisplay", "search", "television"
}

export interface ClientKPI {
  id: number;
  created_at: number;
  mp_client_name: string;
  publisher_name: string; // matches PublisherKPI.publisher
  media_type: string;
  bid_strategy: string;
  ctr: number;
  cpv: number;
  conversion_rate: number;
  vtr: number;
  frequency: number;
}

export interface CampaignKPI {
  id?: number;
  created_at?: number;
  mp_client_name: string;
  mba_number: string;
  version_number: number;
  campaign_name: string;
  media_type: string;
  publisher: string;
  bid_strategy: string;
  ctr: number;
  cpv: number;
  conversion_rate: number;
  vtr: number;
  frequency: number;
}

// UI-only — not persisted to Xano directly
export interface ResolvedKPIRow extends CampaignKPI {
  lineItemId: string;
  lineItemLabel: string;
  spend: number;
  deliverables: number;
  buyType: string;
  source: 'client' | 'publisher' | 'default' | 'manual' | 'saved';
  isManuallyEdited: boolean;
  calculatedClicks: number;
  calculatedViews: number;
  calculatedReach: number;
}
