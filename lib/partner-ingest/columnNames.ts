export const CHANNEL_FACTORY_SOURCE_LABEL = "Channel Factory"

export const CHANNEL_FACTORY_EXPECTED_HEADER =
  "Day|Campaign Advertiser ID|Campaign Name|Media Buy Name|Impressions|Clicks|Video Views|Video Completions 25% Rate|Video Completions 50% Rate|Video Completions 75% Rate|Video Fully Played Rate"

export const COL = {
  day: "Day",
  advertiserId: "Campaign Advertiser ID",
  campaignName: "Campaign Name",
  mediaBuyName: "Media Buy Name",
  impressions: "Impressions",
  clicks: "Clicks",
  videoViews: "Video Views",
  rateQ25: "Video Completions 25% Rate",
  rateQ50: "Video Completions 50% Rate",
  rateQ75: "Video Completions 75% Rate",
  rateFullyPlayed: "Video Fully Played Rate",
} as const

export const VISTAR_SOURCE_LABEL = "Vistar"

export const VISTAR_EXPECTED_HEADER =
  "Day,Venue Type,Advertiser,Insertion Order Name,Insertion Order,Contract Number,Campaign Name,Campaign ID,Campaign Pixel,Creative Name,Creative ID,Creative Pixel,Metro Area,State/Territory,Impressions,Spots,Revenue,Total eCPM"

export const VISTAR_COL = {
  day: "Day",
  venueType: "Venue Type",
  advertiser: "Advertiser",
  insertionOrderName: "Insertion Order Name",
  insertionOrder: "Insertion Order",
  contractNumber: "Contract Number",
  campaignName: "Campaign Name",
  campaignId: "Campaign ID",
  creativeName: "Creative Name",
  creativeId: "Creative ID",
  metroArea: "Metro Area",
  state: "State/Territory",
  impressions: "Impressions",
  spots: "Spots",
  revenue: "Revenue",
  totalEcpm: "Total eCPM",
} as const
