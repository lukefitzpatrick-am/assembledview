import type { NamingTemplate, TemplateElement } from "./types"

function el(
  key: string,
  source: TemplateElement["source"],
  extra: Partial<TemplateElement> = {},
): TemplateElement {
  return { key, source, ...extra }
}

function plan(key: string, extra: Partial<TemplateElement> = {}): TemplateElement {
  return el(key, "plan", extra)
}

function free(key: string, extra: Partial<TemplateElement> = {}): TemplateElement {
  return el(key, "free", extra)
}

function pick(
  key: string,
  picklist: string,
  extra: Partial<TemplateElement> = {},
): TemplateElement {
  return el(key, "picklist", { picklist, ...extra })
}

function lit(literal: string): TemplateElement {
  return el(literal, "literal", { literal })
}

function tpl(
  platform: string,
  level: string,
  elements: TemplateElement[],
  extra: Partial<NamingTemplate> = {},
): NamingTemplate {
  return {
    platform,
    level,
    elements,
    separator: "-",
    case: "lower",
    ...extra,
  }
}

const FY_QUARTERS: string[] = []
for (const yy of [26, 27]) {
  for (const q of [1, 2, 3, 4]) {
    FY_QUARTERS.push(`fy${yy}q${q}`)
  }
}

export const PICKLISTS: Record<string, readonly string[]> = {
  iab_sizes: [
    "300x250",
    "728x90",
    "970x250",
    "300x600",
    "160x600",
    "320x50",
    "970x90",
    "336x280",
    "15s",
    "30s",
    "6s",
  ],
  meta_platforms: ["fbig", "fb", "ig"],
  fy_quarters: FY_QUARTERS,
  meta_objectives: [
    "awareness",
    "traffic",
    "engagement",
    "leads",
    "conversions",
    "sales",
    "app_promotion",
  ],
  geo: [
    "au",
    "nsw",
    "vic",
    "qld",
    "sa",
    "wa",
    "tas",
    "nt",
    "act",
    "metro",
    "regional",
  ],
  meta_formats: ["static", "video", "carousel", "story", "reel"],
}

export const TEMPLATES: NamingTemplate[] = [
  // --- cm360 (scope: all non-programmatic digital channels) ---
  tpl(
    "cm360",
    "campaign",
    [plan("brand"), plan("campaign"), plan("mba"), plan("month_start")],
    {
      scope: "all non-programmatic digital channels",
      // DEFAULT(Q1): master preserved case; lowered for consistency
      case: "lower",
    },
  ),
  tpl(
    "cm360",
    "package",
    [
      plan("brand"),
      plan("campaign"),
      plan("month_start"),
      plan("publisher"),
      plan("media_type"),
      plan("targeting"),
    ],
    { scope: "all non-programmatic digital channels" },
  ),
  tpl(
    "cm360",
    "placement",
    [
      plan("brand"),
      plan("campaign"),
      plan("publisher"),
      plan("media_type"),
      pick("size", "iab_sizes"),
      plan("targeting"),
      plan("line_item_id", { isLineItemId: true }),
    ],
    { scope: "all non-programmatic digital channels", isPacingGrain: true },
  ),
  tpl(
    "cm360",
    "ad",
    [
      plan("brand"),
      plan("campaign"),
      plan("publisher"),
      plan("targeting"),
      plan("creative_name"),
      pick("size", "iab_sizes"),
    ],
    { scope: "all non-programmatic digital channels" },
  ),

  // --- dv360 (scope: all programmatic channels) ---
  tpl(
    "dv360",
    "campaign",
    [
      plan("brand"),
      plan("campaign"),
      plan("mba"),
      plan("month_start"),
      lit("programmatic"),
    ],
    { scope: "all programmatic channels" },
  ),
  tpl(
    "dv360",
    "insertion_order",
    [plan("brand"), plan("campaign"), plan("media_type"), free("custom", { optional: true })],
    { scope: "all programmatic channels" },
  ),
  tpl(
    "dv360",
    "line_item",
    [
      plan("brand"),
      plan("campaign"),
      plan("media_type"),
      plan("targeting"),
      free("custom", { optional: true }),
      plan("line_item_id", { isLineItemId: true }),
    ],
    { scope: "all programmatic channels", isPacingGrain: true },
  ),
  // DEFAULT(Q4): free token, size picklist offered in UI
  tpl(
    "dv360",
    "ad",
    [plan("io_name"), free("token")],
    { scope: "all programmatic channels" },
  ),

  // --- youtube: identical to dv360 with literal "youtube"; ONE optional custom on line_item ---
  tpl(
    "youtube",
    "campaign",
    [
      plan("brand"),
      plan("campaign"),
      plan("mba"),
      plan("month_start"),
      lit("youtube"),
    ],
  ),
  tpl("youtube", "insertion_order", [
    plan("brand"),
    plan("campaign"),
    plan("media_type"),
    free("custom", { optional: true }),
  ]),
  // DEFAULT(Q5): single custom, matching dv360
  tpl(
    "youtube",
    "line_item",
    [
      plan("brand"),
      plan("campaign"),
      plan("media_type"),
      plan("targeting"),
      free("custom", { optional: true }),
      plan("line_item_id", { isLineItemId: true }),
    ],
    { isPacingGrain: true },
  ),
  tpl("youtube", "ad", [plan("io_name"), free("token")]),

  // --- meta ---
  tpl("meta", "campaign", [
    pick("platform_code", "meta_platforms"),
    plan("client"),
    plan("campaign"),
    pick("timing", "fy_quarters"),
    pick("objective", "meta_objectives"),
    free("custom", { optional: true }),
  ]),
  tpl(
    "meta",
    "ad_set",
    [
      plan("campaign_name"),
      free("geo"),
      plan("targeting"),
      free("custom", { optional: true }),
      plan("line_item_id", { isLineItemId: true }),
    ],
    { isPacingGrain: true },
  ),
  // DEFAULT(Q6)
  tpl("meta", "ad", [
    plan("creative_name"),
    pick("format", "meta_formats"),
    free("custom", { optional: true }),
  ]),

  // --- search ---
  tpl("search", "campaign", [
    plan("client"),
    plan("campaign"),
    lit("search"),
    free("match_context"),
  ]),
  tpl(
    "search",
    "ad_group",
    [
      plan("campaign_name"),
      free("keyword_theme"),
      plan("line_item_id", { isLineItemId: true }),
    ],
    { isPacingGrain: true },
  ),

  // --- native (Taboola) ---
  tpl(
    "native",
    "campaign",
    [
      plan("brand"),
      plan("campaign"),
      plan("mba"),
      plan("month_start"),
      lit("native"),
      plan("line_item_id", { isLineItemId: true }),
    ],
    { isPacingGrain: true },
  ),
]

export function getTemplate(
  platform: string,
  level: string,
): NamingTemplate | undefined {
  return TEMPLATES.find((t) => t.platform === platform && t.level === level)
}
