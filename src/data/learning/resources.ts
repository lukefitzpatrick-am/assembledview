// Knowledge Hub — External Resource Hub (structured data, hand-authored).
// Rendered by app/knowledge/resources. Curated links OUT to the sources of truth an
// outsourced/junior media team should live in: platform training & certification,
// AU measurement currencies, industry bodies, global standards, effectiveness and news.
//
// All URLs verified as resolving official/canonical pages on 2026-07-02.
// Rule: never add a link we haven't confirmed. When a source moves, fix it here.

import type { AccentKey } from "@/src/lib/learning/accents";

export type ResourceItem = {
  label: string;
  url: string;
  /** One line: what it is / why it's useful. */
  blurb: string;
  /** Optional flag for AU-specific sources (drives a small "AU" tag). */
  au?: boolean;
  /** Optional: marks a free training/certification you can complete. */
  cert?: boolean;
};

export type ResourceGroup = {
  id: string;
  title: string;
  /** Short intro shown under the group heading. */
  blurb: string;
  /** Accent colour key from src/lib/learning/accents.ts. */
  accent: AccentKey;
  items: ResourceItem[];
};

export const resourcesReviewedAt = "2026-07-02";

export const resourceGroups: ResourceGroup[] = [
  {
    id: "platform-training",
    title: "Platform training & certification",
    accent: "green",
    blurb:
      "Free, official courses and certifications. Start here when you pick up a new platform - every one is worth completing end-to-end.",
    items: [
      { label: "Google Skillshop", url: "https://skillshop.exceedlms.com/student/catalog", blurb: "Official Google Ads & Analytics (GA4) courses and certifications.", cert: true },
      { label: "Meta Blueprint", url: "https://www.facebook.com/business/learn", blurb: "Free Meta training and certification for Facebook and Instagram advertising.", cert: true },
      { label: "TikTok Academy", url: "https://ads.tiktok.com/business/en/academy", blurb: "Official TikTok learning hub with courses and media-buying certification.", cert: true },
      { label: "LinkedIn Marketing Labs", url: "https://training.marketing.linkedin.com/", blurb: "Free on-demand courses and certifications for advertising on LinkedIn.", cert: true },
      { label: "Amazon Ads Academy", url: "https://advertising.amazon.com/academy", blurb: "Free learning paths and certifications for Amazon Ads and DSP.", cert: true },
      { label: "Microsoft Advertising Learning Lab", url: "https://about.ads.microsoft.com/en/resources/training-certification/learning-lab", blurb: "Free training and certification for Microsoft (Bing) Advertising.", cert: true },
      { label: "Pinterest Academy", url: "https://www.pinterestacademy.com/student/catalog", blurb: "Free Pinterest advertising courses, skill badges and certification.", cert: true },
      { label: "Snap Focus", url: "https://forbusiness.snapchat.com/resources/snapfocus", blurb: "Snapchat's official learning portal and advertising certification.", cert: true },
      { label: "Reddit Ads Formula", url: "https://adsformula.redditforbusiness.com/", blurb: "Reddit's official on-demand training and certification for advertisers.", cert: true },
      { label: "Spotify Advertising Academy", url: "https://advertisingacademy.byspotify.com/", blurb: "Free Spotify courses and certification for digital audio campaigns.", cert: true },
    ],
  },
  {
    id: "platform-help",
    title: "Platform help & product docs",
    accent: "blue",
    blurb:
      "The source of truth for how a platform actually works - specs, setup and troubleshooting. Defer to these over any blog post.",
    items: [
      { label: "Google Ads Help Center", url: "https://support.google.com/google-ads/", blurb: "Official Google Ads support docs, tutorials and troubleshooting." },
      { label: "Meta Business Help Center", url: "https://www.facebook.com/business/help", blurb: "Official support for Meta ads and business tools." },
      { label: "Display & Video 360 Help", url: "https://support.google.com/displayvideo/", blurb: "Official DV360 help docs, tutorials and FAQs." },
      { label: "Campaign Manager 360 Help", url: "https://support.google.com/campaignmanager/", blurb: "Official CM360 help docs, setup guides and FAQs." },
      { label: "GA4 Help Center", url: "https://support.google.com/analytics/", blurb: "Official Google Analytics 4 setup, reporting and troubleshooting docs." },
      { label: "Google Tag Manager Help", url: "https://support.google.com/tagmanager/", blurb: "Official GTM docs for tags, containers and configuration." },
      { label: "Looker Studio Help", url: "https://support.google.com/looker-studio/", blurb: "Official Looker Studio (formerly Data Studio) reporting docs." },
      { label: "Google Merchant Center Help", url: "https://support.google.com/merchants/", blurb: "Official Merchant Center help for product feeds and Shopping." },
    ],
  },
  {
    id: "au-measurement",
    title: "Australian measurement & currencies",
    accent: "purple",
    blurb:
      "The official audience currencies you plan and trade against in-market. Know what each measures before you quote a number.",
    items: [
      { label: "OzTAM", url: "https://oztam.com.au/", blurb: "Australia's official TV audience measurement body (broadcast, BVOD, Total TV).", au: true },
      { label: "VOZ", url: "https://virtualoz.com.au/", blurb: "OzTAM's Total TV all-screen measurement - Australia's TV trading currency.", au: true },
      { label: "GfK Radio", url: "https://www.gfk-media-measurement.com/", blurb: "Official metro/regional radio audience ratings for Australia.", au: true },
      { label: "Ipsos iris", url: "https://iris-au.ipsos.com/", blurb: "Australia's IAB-endorsed digital audience measurement currency.", au: true },
      { label: "MOVE", url: "https://moveoutdoor.com.au/", blurb: "Australia's out-of-home audience measurement currency (MOVE/MOVE 2.0).", au: true },
      { label: "Roy Morgan", url: "https://www.roymorgan.com/", blurb: "Australia's longest-established consumer, social and market research.", au: true },
      { label: "Nielsen (Australia)", url: "https://www.nielsen.com/en-au/", blurb: "Global media/audience measurement and consumer data - AU hub.", au: true },
      { label: "AMAA", url: "https://www.auditedmedia.org.au/", blurb: "Independent auditing of circulation, traffic and attendance.", au: true },
    ],
  },
  {
    id: "au-bodies",
    title: "Australian industry bodies",
    accent: "amber",
    blurb:
      "Peak bodies for standards, effectiveness research and the self-regulation codes we work inside.",
    items: [
      { label: "IAB Australia", url: "https://www.iabaustralia.com.au/", blurb: "Peak body for digital advertising standards, research and measurement.", au: true },
      { label: "MFA", url: "https://www.mediafederation.org.au/", blurb: "Media Federation of Australia - media-agency standards and training.", au: true },
      { label: "ThinkTV", url: "https://thinktv.com.au/", blurb: "TV advertising body - research, effectiveness data and planning tools.", au: true },
      { label: "ThinkNewsBrands", url: "https://thinknewsbrands.com.au/", blurb: "Advocacy body for news media advertising effectiveness.", au: true },
      { label: "Commercial Radio & Audio", url: "https://cra.au/", blurb: "Peak body for commercial radio/audio - ratings, codes and advocacy.", au: true },
      { label: "Outdoor Media Association", url: "https://oma.org.au/", blurb: "Peak body for out-of-home - owns MOVE, plus codes and policy.", au: true },
      { label: "AANA", url: "https://aana.com.au/", blurb: "Advertiser body running Australia's advertising self-regulation codes.", au: true },
      { label: "Ad Standards", url: "https://adstandards.com.au/", blurb: "Independent advertising complaints and standards adjudicator.", au: true },
      { label: "Free TV Australia", url: "https://www.freetv.com.au/", blurb: "Peak body for commercial free-to-air TV - standards and policy.", au: true },
      { label: "ADMA", url: "https://adma.com.au/", blurb: "Data-driven marketing body - training, resources and compliance.", au: true },
    ],
  },
  {
    id: "global-standards",
    title: "Global standards & governance",
    accent: "coral",
    blurb:
      "Who sets the specs, accreditation and brand-safety rules the whole ecosystem runs on.",
    items: [
      { label: "IAB Tech Lab", url: "https://iabtechlab.com/", blurb: "Sets adtech standards - ads.txt, VAST, OpenRTB and more." },
      { label: "IAB (US)", url: "https://www.iab.com/", blurb: "US digital advertising trade body - guidelines, standards, research." },
      { label: "Media Rating Council", url: "https://mediaratingcouncil.org/", blurb: "Audits and accredits measurement for viewability and validity." },
      { label: "WFA", url: "https://wfanet.org/", blurb: "World Federation of Advertisers - global media and brand-safety standards." },
      { label: "TAG", url: "https://www.tagtoday.net/", blurb: "Trustworthy Accountability Group - ad fraud, malware and brand safety." },
      { label: "ANA", url: "https://www.ana.net/", blurb: "US Association of National Advertisers - marketing standards and training." },
      { label: "Coalition for Better Ads", url: "https://www.betterads.org/", blurb: "Sets the Better Ads Standards for acceptable ad experiences." },
    ],
  },
  {
    id: "effectiveness",
    title: "Effectiveness & marketing science",
    accent: "magenta",
    blurb:
      "The evidence base for why media works - use these to defend a plan, not just build it.",
    items: [
      { label: "Think with Google", url: "https://www.thinkwithgoogle.com/", blurb: "Google's marketing research, consumer insights and digital trends." },
      { label: "WARC", url: "https://www.warc.com/", blurb: "Marketing effectiveness evidence, case studies and ROI benchmarks." },
      { label: "The B2B Institute", url: "https://business.linkedin.com/marketing-solutions/b2b-institute", blurb: "LinkedIn think tank on B2B brand-building and growth." },
      { label: "Ehrenberg-Bass Institute", url: "https://marketingscience.info/", blurb: "Evidence-based marketing science - the 'How Brands Grow' research." },
    ],
  },
  {
    id: "news",
    title: "Industry news & publications",
    accent: "neutral",
    blurb:
      "Stay current. Skim the AU trades weekly and the global adtech titles for what's changing under the hood.",
    items: [
      { label: "Mumbrella", url: "https://mumbrella.com.au/", blurb: "Australian media and marketing industry news, analysis and events.", au: true },
      { label: "AdNews", url: "https://www.adnews.com.au/", blurb: "Australian advertising, media and marketing trade news.", au: true },
      { label: "B&T", url: "https://www.bandt.com.au/", blurb: "Australian advertising, marketing, media and PR news.", au: true },
      { label: "AdExchanger", url: "https://www.adexchanger.com/", blurb: "Deep programmatic and adtech news, analysis and data." },
      { label: "Digiday", url: "https://digiday.com/", blurb: "Modern media and marketing news - platforms, agencies, publishing." },
      { label: "Search Engine Land", url: "https://searchengineland.com/", blurb: "Daily SEO, PPC and AI-search news for search marketers." },
      { label: "Search Engine Journal", url: "https://www.searchenginejournal.com/", blurb: "SEO and search marketing news, guides and how-tos." },
      { label: "The Drum", url: "https://www.thedrum.com/", blurb: "Global marketing, advertising and media news and insight." },
      { label: "Marketing Dive", url: "https://www.marketingdive.com/", blurb: "In-depth journalism on marketing and advertising trends." },
      { label: "Adweek", url: "https://www.adweek.com/", blurb: "Brand-marketing news - creativity, agencies and media platforms." },
      { label: "Campaign (Asia)", url: "https://www.campaignasia.com/", blurb: "Advertising, media and creativity news for Asia-Pacific." },
      { label: "Marketing Week", url: "https://www.marketingweek.com/", blurb: "UK marketing news, opinion and brand strategy analysis." },
    ],
  },
  {
    id: "tools",
    title: "Tools & reference",
    accent: "lime",
    blurb:
      "Handy utilities you'll reach for often. (Our own UTM Builder lives in the Knowledge Hub under Tools.)",
    items: [
      { label: "Campaign URL Builder (GA4)", url: "https://ga-dev-tools.google/ga4/campaign-url-builder/", blurb: "Google's official UTM builder - the canonical reference for tagging." },
    ],
  },
];

/** Flat count for headers / smoke checks. */
export const resourceCount = resourceGroups.reduce((n, g) => n + g.items.length, 0);
