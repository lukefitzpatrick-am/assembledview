// Knowledge Hub — Guides content (structured data, hand-authored).
// Rendered by app/knowledge/guides. Keep prose plain (no markup); the UI styles it with design tokens.

export type GuideSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type GuideLink = { label: string; url: string };

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  /** Top-level grouping for the guides index. */
  group: string;
  /** Cross-cutting collection tags, e.g. "2026", "au". */
  collections?: string[];
  level?: "foundational" | "intermediate" | "advanced";
  sections: GuideSection[];
  furtherReading: GuideLink[];
  relatedTerms?: string[];
  reviewedAt?: string;
};

export const guides: Guide[] = [
  {
    slug: "the-media-workflow",
    title: "The media workflow",
    summary:
      "Every campaign runs the same loop. Knowing where you are in it explains what everyone is doing and why.",
    group: "Foundations",
    level: "foundational",
    sections: [
      {
        heading: "Brief to report, step by step",
        bullets: [
          "Brief - the client or strategy team sets the objective, audience, budget, timing and success measures. A good brief names the business outcome, not just 'awareness'.",
          "Strategy and channel plan - the planner turns the brief into which channels, how much, and when. Output is a media plan or flowchart.",
          "Buy - the buyer secures inventory directly with publishers or programmatically through a DSP; rates, added value and make-goods are negotiated here.",
          "Traffic and launch - ad ops places tags, pixels and trackers and QAs the specs. Small errors here quietly break measurement.",
          "Optimise - once data flows, budget shifts toward what works, increasingly in-flight with automation and AI.",
          "Report - results are read back against the brief's success measures, each number framed by objective and funnel stage.",
        ],
      },
      {
        heading: "Why it matters",
        paragraphs: [
          "The loop repeats: last campaign's report informs next campaign's brief. Modern best practice anchors the whole loop in measurement defined up front, not bolted on at the end.",
        ],
      },
    ],
    furtherReading: [
      { label: "Drive business goals with modern measurement - Think with Google", url: "https://business.google.com/us/think/measurement/drive-business-goals-modern-measurement/" },
      { label: "Video Measurement Framework - IAB Australia", url: "https://www.iabaustralia.com.au/resource/video-measurement-framework/" },
      { label: "The media planning process - HubSpot", url: "https://blog.hubspot.com/marketing/media-planning" },
    ],
    relatedTerms: ["Reach", "Frequency", "CPM"],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "media-math-essentials",
    title: "Media math essentials",
    summary:
      "The numbers every plan and report is built from. Master these six and most of media makes sense.",
    group: "Foundations",
    level: "foundational",
    sections: [
      {
        heading: "The six you need",
        bullets: [
          "Impressions - times an ad was served (repeats included). The base unit of delivery.",
          "Reach - unique people who saw the ad at least once. People, not views.",
          "Frequency - average times each reached person saw it. Frequency = Impressions / Reach.",
          "GRP / TARP - Gross/Target Rating Points = Reach % x Frequency. TARPs are the Australian term, against a target audience.",
          "CPM - cost per thousand impressions = (Cost / Impressions) x 1,000.",
          "CPP - cost per (rating) point = Cost / GRPs.",
        ],
      },
      {
        heading: "The relationships matter more than the formulas",
        paragraphs: [
          "Reach x Frequency = GRPs. The same impressions can mean broad-and-shallow (high reach, low frequency) or narrow-and-deep (low reach, high frequency). Planning is largely choosing where to sit on that trade-off.",
          "Worked example: 2,000,000 impressions to 500,000 people = frequency 4. If that's 25% of a 2,000,000 target audience, that's 25% x 4 = 100 TARPs. At $20,000 spend, CPM = $10 and CPP = $200.",
        ],
      },
    ],
    furtherReading: [
      { label: "Digital Advertising Glossary - IAB Australia", url: "https://www.iabaustralia.com.au/guideline/digital-advertising-glossary-of-terms-july-2019/" },
      { label: "Ad Effectiveness glossary (PDF) - IAB Australia", url: "https://www.iabaustralia.com.au/wp-content/uploads/2019/10/Ad_Effectiveness_InteractiveGlossary_June2019.pdf" },
      { label: "Impressions and viewable CPM - Google Ads Help", url: "https://support.google.com/google-ads/answer/7029393" },
      { label: "Reach, frequency, GRPs, CPP and CPM - Bionic", url: "https://www.bionic-ads.com/2016/03/reach-frequency-ratings-grps-impressions-cpp-and-cpm-in-advertising/" },
    ],
    relatedTerms: ["Reach", "Frequency", "GRP", "CPM", "CPP"],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "the-marketing-funnel",
    title: "The marketing funnel",
    summary:
      "Shorthand for the journey from 'never heard of you' to 'loyal customer'. Different channels and metrics do different jobs at each stage.",
    group: "Foundations",
    level: "foundational",
    sections: [
      {
        heading: "The stages",
        bullets: [
          "Awareness (upper) - broad reach: TV/BVOD, online video/CTV, OOH, social. Measured by reach, frequency, brand lift - not immediate sales.",
          "Consideration (mid) - audiences who now know you: social, display, content. Measured by engagement, site visits, video completion.",
          "Conversion (lower) - people with intent: search, retail media, retargeting. Measured by CPA, ROAS, conversions.",
          "Loyalty - existing customers: CRM, email, retention.",
        ],
      },
      {
        heading: "The classic mistake",
        paragraphs: [
          "Judging an upper-funnel tactic by lower-funnel metrics - for example expecting a TV burst to show last-click sales. Full-funnel planning means setting the right metric per stage and reading them together.",
        ],
      },
    ],
    furtherReading: [
      { label: "The power of full-funnel marketing - Think with Google", url: "https://business.google.com/us/think/measurement/full-funnel-marketing/" },
      { label: "Building a full-funnel strategy - Think with Google", url: "https://business.google.com/us/think/consumer-insights/full-funnel-marketing-strategy/" },
      { label: "The marketing funnel explained - Amazon Ads", url: "https://advertising.amazon.com/library/guides/marketing-funnel" },
    ],
    relatedTerms: ["Brand Lift", "ROAS", "CPA"],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "brand-building-vs-performance",
    title: "Brand building vs performance",
    summary:
      "Two jobs, both necessary. Performance captures existing demand fast; brand building creates future demand slowly.",
    group: "Foundations",
    level: "intermediate",
    sections: [
      {
        heading: "The two jobs",
        paragraphs: [
          "Performance (or activation) captures demand that already exists - search, retargeting, retail media - and shows up fast in last-click reporting. Brand building creates future demand by building memory and preference broadly over time, and shows up slowly. Cut brand to feed performance and the numbers look great for a few quarters, then demand thins out.",
        ],
      },
      {
        heading: "The evidence base",
        bullets: [
          "Binet and Field's IPA work (The Long and the Short of It) popularised the ~60/40 split: roughly 60% brand building, 40% activation, varying by category.",
          "In B2B, LinkedIn's B2B Institute frames the 95-5 rule: at any time only ~5% of buyers are in-market, so the other 95% are a brand-building audience.",
          "For a media plan: don't let last-click economics quietly defund the brand work. Measure the two with different yardsticks (brand lift / share of voice for brand; CPA / ROAS for performance) and protect the balance.",
        ],
      },
    ],
    furtherReading: [
      { label: "Les Binet and Peter Field research index - IPA", url: "https://ipa.co.uk/knowledge/effectiveness-research-analysis/les-binet-peter-field" },
      { label: "The Long and the Short of It - IPA", url: "https://ipa.co.uk/knowledge/publications-reports/the-long-and-the-short-of-it-balancing-short-and-long-term-marketing-strategies/" },
      { label: "The 95-5 rule - LinkedIn B2B Institute", url: "https://business.linkedin.com/advertise/resources/b2b-institute/b2b-research/trends/95-5-rule" },
      { label: "How B2B Brands Grow - LinkedIn B2B Institute", url: "https://business.linkedin.com/marketing-solutions/b2b-institute/how-b2b-brands-grow" },
    ],
    relatedTerms: ["Share of Voice", "Brand Lift", "ROAS"],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "how-to-read-your-media-report",
    title: "How to read your media report",
    summary:
      "A report is a story about whether the money worked. Five habits keep you out of trouble.",
    group: "Foundations",
    level: "foundational",
    sections: [
      {
        heading: "Five habits",
        bullets: [
          "Match metric to objective - a brand campaign judged on last-click CPA will always look bad; a performance campaign judged on reach will always look good. Ask what each line was for first.",
          "Impressions are not reach are not attention - impressions are deliveries, reach is people, and neither proves the ad was seen. That's what viewability measures.",
          "'Good' is relative - a good CPM, CTR or ROAS depends entirely on channel, format and objective. Benchmarks only mean something like-for-like.",
          "Know whose number it is - platform-reported results use that platform's own attribution and often over-credit themselves; your ad-server or independent measurement will differ.",
          "Read clicks with suspicion - CTR is a diagnostic, not an outcome. Conversions and incrementality tell you about value.",
        ],
      },
    ],
    furtherReading: [
      { label: "Viewability metrics - Google Ads Help", url: "https://support.google.com/google-ads/answer/7029393" },
      { label: "How conversion credit works - Google Ads Help", url: "https://support.google.com/google-ads/answer/6259715" },
      { label: "Marketing metrics that matter - IAB Australia", url: "https://www.iabaustralia.com.au/resource/iab-member-qa-series-marketing-metrics-that-matter/" },
      { label: "MRC Viewable Impression guidelines - IAB/MRC", url: "https://www.iab.com/guidelines/mrc-viewable-impression-guidelines/" },
    ],
    relatedTerms: ["Impressions", "Reach", "Viewability", "CTR"],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "attribution-models-explained",
    title: "Attribution models explained",
    summary:
      "Attribution is how credit for a conversion gets shared across the ads a customer saw or clicked. The model changes who looks like the hero.",
    group: "Measurement & attribution",
    level: "intermediate",
    sections: [
      {
        heading: "The models",
        bullets: [
          "Last-click / last-touch - 100% of credit to the final click. Default, simple, and over-credits the closing channel.",
          "View-through - credits an impression that was seen but not clicked (common in display/video). Easy to over-claim.",
          "Data-driven (DDA) - uses modelling to distribute credit across touchpoints. Now Google's default.",
          "Multi-touch (MTA) - any model spreading credit across touchpoints; increasingly limited by signal loss.",
        ],
      },
      {
        heading: "Currency note (important)",
        paragraphs: [
          "Google has retired first-click, linear, time-decay and position-based models in Google Ads - only last-click and data-driven remain. Don't cite the retired ones as current options. View-through is handled separately from the click models.",
          "The honest framing for clients: attribution is a lens, not the truth. For the real causal picture, pair it with incrementality or MMM.",
        ],
      },
    ],
    furtherReading: [
      { label: "About attribution models - Google Ads Help", url: "https://support.google.com/google-ads/answer/6259715" },
      { label: "How data-driven attribution works - Google Ads Help", url: "https://support.google.com/google-ads/answer/6394265" },
      { label: "Attribution and models in GA4 - Google Analytics Help", url: "https://support.google.com/analytics/answer/10596866" },
    ],
    relatedTerms: ["Last Click", "MTA", "Incrementality", "MMM"],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "mmm-vs-mta-vs-incrementality",
    title: "MMM vs MTA vs incrementality",
    summary:
      "Three ways to answer 'did the advertising actually work?' - used together, not as rivals. The modern, privacy-resilient measurement stack.",
    group: "Measurement & attribution",
    collections: ["2026"],
    level: "advanced",
    sections: [
      {
        heading: "The three approaches",
        bullets: [
          "MMM (Marketing/Media Mix Modelling) - top-down statistical modelling of aggregate sales against media spend. Privacy-proof, good for budget allocation, broad-brush. Resurgent because it survives signal loss.",
          "MTA (Multi-Touch Attribution) - bottom-up, user-level credit across touchpoints. Granular when it works, but increasingly constrained by cookie loss and walled gardens.",
          "Incrementality testing - controlled experiments (geo holdouts, matched markets, conversion lift) measuring causal lift. The closest thing to ground truth.",
        ],
      },
      {
        heading: "Triangulation is the best practice",
        paragraphs: [
          "Use MMM to set the budget split, incrementality to validate the big bets causally, and attribution/MTA for day-to-day, in-platform optimisation. No single one is sufficient alone.",
        ],
      },
    ],
    furtherReading: [
      { label: "Modern measurement - Think with Google", url: "https://business.google.com/us/think/measurement/drive-business-goals-modern-measurement/" },
      { label: "Getting a grip on incrementality - Think with Google", url: "https://business.google.com/in/think/marketing-strategies/marketing-incrementality/" },
      { label: "Marketing metrics that matter - IAB Australia", url: "https://www.iabaustralia.com.au/resource/iab-member-qa-series-marketing-metrics-that-matter/" },
      { label: "Incrementality vs MMM vs MTA - Measured", url: "https://www.measured.com/faq/what-are-the-pros-and-cons-of-incrementality-testing-versus-mmm-or-mta/" },
    ],
    relatedTerms: ["MMM", "MTA", "Incrementality", "Geo Lift", "Conversion Lift"],
    reviewedAt: "2026-06-30",
  },
  {
    slug: "voz-total-tv",
    title: "VOZ / Total TV (Australia)",
    summary:
      "If you plan or report TV in Australia, you work in VOZ - the official Total TV measurement and trading currency.",
    group: "Australian essentials",
    collections: ["au"],
    level: "intermediate",
    sections: [
      {
        heading: "What VOZ is",
        paragraphs: [
          "Virtual OzTAM (VOZ) combines broadcast viewing (the OzTAM/Regional TAM panels) with broadcaster video on demand (BVOD) into one de-duplicated, all-screen audience, modelled up to a 'Virtual Australia' population - so a person watching the same show on TV and on an app is counted once.",
          "It became the agreed trading currency from late December 2024, replacing panel-only ratings as the basis on which TV is bought and evaluated.",
        ],
      },
      {
        heading: "Three things to internalise",
        bullets: [
          "TARPs (Target Audience Rating Points) are the Australian rating-point currency - the TV equivalent of GRPs against a target audience.",
          "BVOD is part of 'TV' now, not a separate digital line - VOZ measures them together.",
          "TV reach quoted in a plan or report is a Total TV number unless stated otherwise.",
        ],
      },
    ],
    furtherReading: [
      { label: "VOZ Total TV - OzTAM", url: "https://oztam.com.au/services/voz-total-tv/" },
      { label: "VOZ (Virtual Australia) product site - OzTAM", url: "https://virtualoz.com.au/" },
      { label: "VOZ Total TV resources - OzTAM", url: "https://oztam.com.au/resources/voz-totaltv-resources/" },
      { label: "Virtual Australia explainer - ThinkTV", url: "https://thinktv.com.au/future-focused/virtual-australia/" },
    ],
    relatedTerms: ["VOZ", "TARP", "BVOD Reach", "OzTAM"],
    reviewedAt: "2026-06-30",
  },
];
