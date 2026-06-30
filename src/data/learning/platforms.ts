// Knowledge Hub — Platform skills content (structured data, hand-authored).
// Rendered by app/knowledge/platforms. Each platform is taught on the same six-pillar scaffold,
// with our POV plus curated links to the official source of truth (specs change - defer to official).

export type PlatformPillar = {
  name: string;
  detail: string;
};

export type PlatformLink = { label: string; url: string };

export type Platform = {
  slug: string;
  name: string;
  cert: string;
  summary: string;
  /** Platform-specific emphasis shown on the card + detail intro. */
  emphasis: string;
  pillars: PlatformPillar[];
  officialLinks: PlatformLink[];
  reviewedAt?: string;
};

const SCAFFOLD = [
  "Account & campaign structure",
  "Objectives & campaign types",
  "Bidding & budget",
  "Audiences & targeting",
  "Creative & formats / specs",
  "Measurement & optimisation",
];

export const platforms: Platform[] = [
  {
    slug: "google-ads",
    name: "Google Ads",
    cert: "Google Skillshop",
    summary: "Search-led intent plus Performance Max across Google's inventory.",
    emphasis: "Adds keyword/match-type strategy and Performance Max asset groups.",
    pillars: [
      { name: SCAFFOLD[0], detail: "Account -> campaign -> ad group -> keywords/assets. Performance Max uses asset groups + audience signals instead of the classic hierarchy." },
      { name: SCAFFOLD[1], detail: "Search, Performance Max, Demand Gen, Display and Video - chosen by funnel stage and goal." },
      { name: SCAFFOLD[2], detail: "Smart Bidding (tCPA, tROAS, Maximise conversions/value); budgets pace across the day." },
      { name: SCAFFOLD[3], detail: "First-party data, Customer Match, in-market/affinity, audience signals (PMax) and exclusions." },
      { name: SCAFFOLD[4], detail: "Responsive Search Ads, video and PMax asset groups - provide many strong assets. Check current specs on the official page." },
      { name: SCAFFOLD[5], detail: "Conversion tracking, Enhanced Conversions, attribution settings and experiments." },
    ],
    officialLinks: [
      { label: "Skillshop", url: "https://skillshop.exceedlms.com/" },
      { label: "Google Ads Help", url: "https://support.google.com/google-ads/" },
      { label: "About Performance Max", url: "https://support.google.com/google-ads/answer/10724817" },
      { label: "Create a Performance Max campaign", url: "https://support.google.com/google-ads/answer/10724896" },
      { label: "Think with Google", url: "https://www.thinkwithgoogle.com/" },
    ],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "meta",
    name: "Meta (Facebook / Instagram)",
    cert: "Meta Blueprint",
    summary: "Social reach and performance across Facebook, Instagram and Reels.",
    emphasis: "Emphasises the Pixel / Conversions API and Advantage+ automation.",
    pillars: [
      { name: SCAFFOLD[0], detail: "Campaign -> ad set -> ad. Advantage+ automates targeting, placement and creative." },
      { name: SCAFFOLD[1], detail: "Awareness, Traffic, Engagement, Leads, App promotion and Sales." },
      { name: SCAFFOLD[2], detail: "Advantage Campaign Budget (formerly CBO); cost-cap / bid-cap / highest-volume strategies." },
      { name: SCAFFOLD[3], detail: "Custom Audiences, Lookalikes, broad + Advantage+ automation. The Pixel/CAPI feed the signal." },
      { name: SCAFFOLD[4], detail: "Advantage+ Creative, video/Reels-first, dynamic formats. Check current specs on the official page." },
      { name: SCAFFOLD[5], detail: "Meta Pixel + Conversions API (server-side) are the durable signal stack; attribution settings in Ads Manager." },
    ],
    officialLinks: [
      { label: "Meta Blueprint", url: "https://www.facebookblueprint.com/" },
      { label: "Meta for Business learning", url: "https://www.facebook.com/business/learn" },
      { label: "Business Help Center", url: "https://www.facebook.com/business/help" },
      { label: "About Advantage+", url: "https://www.facebook.com/business/help/733979527611858" },
      { label: "Advantage+ Creative", url: "https://www.facebook.com/business/help/297506218282224" },
      { label: "Meta Pixel docs", url: "https://developers.facebook.com/docs/meta-pixel/" },
      { label: "Conversions API", url: "https://developers.facebook.com/docs/marketing-api/conversions-api/" },
    ],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "tiktok",
    name: "TikTok",
    cert: "TikTok Academy",
    summary: "Sound-on, creator-led video reach and performance.",
    emphasis: "Native, creator-led creative and Spark Ads are central.",
    pillars: [
      { name: SCAFFOLD[0], detail: "Campaign -> ad group -> ad." },
      { name: SCAFFOLD[1], detail: "Reach, Video views, Traffic, Community/engagement, Lead gen and Product sales." },
      { name: SCAFFOLD[2], detail: "Lowest cost / cost cap. The learning phase matters - avoid over-editing." },
      { name: SCAFFOLD[3], detail: "Interest & behaviour targeting, Custom & Lookalike audiences, first-party data." },
      { name: SCAFFOLD[4], detail: "Native, sound-on, creator-led; Spark Ads boost organic/creator posts. Use the Creative Center for current trends and specs." },
      { name: SCAFFOLD[5], detail: "TikTok Pixel / Events API, attribution settings, conversion tracking." },
    ],
    officialLinks: [
      { label: "Ads Manager Help", url: "https://ads.tiktok.com/help/" },
      { label: "TikTok Academy", url: "https://ads.tiktok.com/business/en/academy" },
      { label: "Business Learning", url: "https://ads.tiktok.com/business/learning" },
      { label: "Creative Center", url: "https://ads.tiktok.com/business/creativecenter/pc/en" },
      { label: "About Spark Ads", url: "https://ads.tiktok.com/help/article/spark-ads" },
    ],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "dv360-programmatic",
    name: "DV360 / Programmatic",
    cert: "Display & Video 360",
    summary: "Programmatic buying across the open web and CTV through a DSP.",
    emphasis: "Adds deal types, inventory/PMP management and cross-screen frequency.",
    pillars: [
      { name: SCAFFOLD[0], detail: "Insertion orders -> line items, managed within a DSP across the open web and CTV. Deal types to know: open auction, private marketplace (PMP), programmatic guaranteed." },
      { name: SCAFFOLD[1], detail: "Programmatic display, video, audio, CTV and DOOH." },
      { name: SCAFFOLD[2], detail: "Automated bidding + manual; pacing and cross-screen frequency management." },
      { name: SCAFFOLD[3], detail: "First-party + third-party data, Google audiences, custom; PMP/deal-based targeting." },
      { name: SCAFFOLD[4], detail: "Standard display, video (VAST), audio and native; spec varies by exchange." },
      { name: SCAFFOLD[5], detail: "Floodlight, Active View viewability, brand-safety/verification and deal-level reporting." },
    ],
    officialLinks: [
      { label: "DV360 Help Center", url: "https://support.google.com/displayvideo/" },
      { label: "DV360 overview", url: "https://support.google.com/displayvideo/answer/9059464" },
    ],
    reviewedAt: "2026-06-30",
  },
];
