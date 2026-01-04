import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

type LearningType = "definition" | "acronym" | "formula";

type Variable = {
  key: string;
  label: string;
  unit?: string;
  required?: boolean;
};

type OutputMeta = {
  label: string;
  unit?: string;
};

export type FormulaDSL = {
  calculatorId?: string;
  expression: string;
  variables: Variable[];
  output: OutputMeta;
  format: "currency" | "percent" | "number";
  inferred?: boolean;
  unmapped?: boolean;
};

export type LearningTerm = {
  id: string;
  term: string;
  canonicalTerm?: string;
  aliases?: string[];
  category: string;
  category_raw?: string | null;
  definition: string;
  formula_or_notes?: string;
  type: LearningType;
  formula?: FormulaDSL;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_PATH = path.resolve(__dirname, "..", "src", "data", "learning", "terms.raw.csv");
const OUTPUT_PATH = path.resolve(__dirname, "..", "src", "data", "learning", "terms.json");

const KNOWN_FORMULAS: Record<string, FormulaDSL> = {
  "ad rank": {
    calculatorId: "ad-rank",
    expression: "bid * quality * context",
    variables: [
      { key: "bid", label: "Bid", unit: "$", required: true },
      { key: "quality", label: "Quality", unit: "", required: true },
      { key: "context", label: "Context", unit: "", required: true },
    ],
    output: { label: "Ad Rank", unit: "" },
    format: "number",
  },
  aov: {
    calculatorId: "aov",
    expression: "revenue / orders",
    variables: [
      { key: "revenue", label: "Revenue", unit: "$", required: true },
      { key: "orders", label: "Orders", required: true },
    ],
    output: { label: "AOV", unit: "$" },
    format: "currency",
  },
  "bid rate": {
    calculatorId: "bid-rate",
    expression: "(bids / requests) * 100",
    variables: [
      { key: "bids", label: "Bids", required: true },
      { key: "requests", label: "Requests", required: true },
    ],
    output: { label: "Bid Rate", unit: "%" },
    format: "percent",
  },
  "cost per lead": {
    calculatorId: "cost-per-lead",
    expression: "cost / leads",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "leads", label: "Leads", required: true },
    ],
    output: { label: "CPL", unit: "$" },
    format: "currency",
  },
  "cost per point": {
    calculatorId: "cost-per-point",
    expression: "cost / grps",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "grps", label: "GRPs", required: true },
    ],
    output: { label: "CPP", unit: "$" },
    format: "currency",
  },
  cpa: {
    calculatorId: "cpa",
    expression: "cost / conversions",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "conversions", label: "Conversions", required: true },
    ],
    output: { label: "CPA", unit: "$" },
    format: "currency",
  },
  cpc: {
    calculatorId: "cpc",
    expression: "cost / clicks",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "clicks", label: "Clicks", required: true },
    ],
    output: { label: "CPC", unit: "$" },
    format: "currency",
  },
  cpe: {
    calculatorId: "cpe",
    expression: "cost / engagements",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "engagements", label: "Engagements", required: true },
    ],
    output: { label: "CPE", unit: "$" },
    format: "currency",
  },
  cpl: {
    calculatorId: "cpl",
    expression: "cost / leads",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "leads", label: "Leads", required: true },
    ],
    output: { label: "CPL", unit: "$" },
    format: "currency",
  },
  cpm: {
    calculatorId: "cpm",
    expression: "(cost / impressions) * 1000",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "impressions", label: "Impressions", required: true },
    ],
    output: { label: "CPM", unit: "$" },
    format: "currency",
  },
  cpp: {
    calculatorId: "cpp",
    expression: "cost / grps",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "grps", label: "GRPs", required: true },
    ],
    output: { label: "CPP", unit: "$" },
    format: "currency",
  },
  cprp: {
    calculatorId: "cprp",
    expression: "cost / trps",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "trps", label: "TRPs", required: true },
    ],
    output: { label: "CPRP", unit: "$" },
    format: "currency",
  },
  ctr: {
    calculatorId: "ctr",
    expression: "(clicks / impressions) * 100",
    variables: [
      { key: "clicks", label: "Clicks", required: true },
      { key: "impressions", label: "Impressions", required: true },
    ],
    output: { label: "CTR", unit: "%" },
    format: "percent",
  },
  cvr: {
    calculatorId: "cvr",
    expression: "(conversions / clicks) * 100",
    variables: [
      { key: "conversions", label: "Conversions", required: true },
      { key: "clicks", label: "Clicks", required: true },
    ],
    output: { label: "CVR", unit: "%" },
    format: "percent",
  },
  ecpm: {
    calculatorId: "ecpm",
    expression: "(cost / impressions) * 1000",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "impressions", label: "Impressions", required: true },
    ],
    output: { label: "eCPM", unit: "$" },
    format: "currency",
  },
  "engagement rate": {
    calculatorId: "engagement-rate",
    expression: "(engagements / impressions) * 100",
    variables: [
      { key: "engagements", label: "Engagements", required: true },
      { key: "impressions", label: "Impressions", required: true },
    ],
    output: { label: "Engagement Rate", unit: "%" },
    format: "percent",
  },
  "fill rate": {
    calculatorId: "fill-rate",
    expression: "(filled_impressions / available_impressions) * 100",
    variables: [
      { key: "filled_impressions", label: "Filled Impressions", required: true },
      { key: "available_impressions", label: "Available Impressions", required: true },
    ],
    output: { label: "Fill Rate", unit: "%" },
    format: "percent",
  },
  "gross margin": {
    calculatorId: "gross-margin",
    expression: "(revenue - cogs) / revenue",
    variables: [
      { key: "revenue", label: "Revenue", unit: "$", required: true },
      { key: "cogs", label: "COGS", unit: "$", required: true },
    ],
    output: { label: "Gross Margin", unit: "" },
    format: "percent",
  },
  grp: {
    calculatorId: "grp",
    expression: "reach_percent * frequency",
    variables: [
      { key: "reach_percent", label: "Reach %", required: true },
      { key: "frequency", label: "Frequency", required: true },
    ],
    output: { label: "GRP", unit: "" },
    format: "number",
  },
  "impression share": {
    calculatorId: "impression-share",
    expression: "(impressions / eligible_impressions) * 100",
    variables: [
      { key: "impressions", label: "Impressions", required: true },
      { key: "eligible_impressions", label: "Eligible Impressions", required: true },
    ],
    output: { label: "Impression Share", unit: "%" },
    format: "percent",
  },
  mer: {
    calculatorId: "mer",
    expression: "total_revenue / total_marketing_spend",
    variables: [
      { key: "total_revenue", label: "Total Revenue", unit: "$", required: true },
      { key: "total_marketing_spend", label: "Total Marketing Spend", unit: "$", required: true },
    ],
    output: { label: "MER", unit: "" },
    format: "number",
  },
  "net margin": {
    calculatorId: "net-margin",
    expression: "net_profit / revenue",
    variables: [
      { key: "net_profit", label: "Net Profit", unit: "$", required: true },
      { key: "revenue", label: "Revenue", unit: "$", required: true },
    ],
    output: { label: "Net Margin", unit: "" },
    format: "percent",
  },
  "profit margin": {
    calculatorId: "profit-margin",
    expression: "(revenue - cost) / revenue",
    variables: [
      { key: "revenue", label: "Revenue", unit: "$", required: true },
      { key: "cost", label: "Cost", unit: "$", required: true },
    ],
    output: { label: "Profit Margin", unit: "" },
    format: "percent",
  },
  roas: {
    calculatorId: "roas",
    expression: "revenue / ad_spend",
    variables: [
      { key: "revenue", label: "Revenue", unit: "$", required: true },
      { key: "ad_spend", label: "Ad Spend", unit: "$", required: true },
    ],
    output: { label: "ROAS", unit: "" },
    format: "number",
  },
  roi: {
    calculatorId: "roi",
    expression: "(ret - cost) / cost",
    variables: [
      { key: "ret", label: "Return", unit: "$", required: true },
      { key: "cost", label: "Cost", unit: "$", required: true },
    ],
    output: { label: "ROI", unit: "" },
    format: "percent",
  },
  vcpm: {
    calculatorId: "vcpm",
    expression: "(cost / viewable_impressions) * 1000",
    variables: [
      { key: "cost", label: "Cost", unit: "$", required: true },
      { key: "viewable_impressions", label: "Viewable Impressions", required: true },
    ],
    output: { label: "vCPM", unit: "$" },
    format: "currency",
  },
  vtr: {
    calculatorId: "vtr",
    expression: "(completed_views / impressions) * 100",
    variables: [
      { key: "completed_views", label: "Completed Views", required: true },
      { key: "impressions", label: "Impressions", required: true },
    ],
    output: { label: "VTR", unit: "%" },
    format: "percent",
  },
  "win rate": {
    calculatorId: "win-rate",
    expression: "(wins / bids) * 100",
    variables: [
      { key: "wins", label: "Wins", required: true },
      { key: "bids", label: "Bids", required: true },
    ],
    output: { label: "Win Rate", unit: "%" },
    format: "percent",
  },
};

const TOKEN_MAP: Record<string, { key: string; label: string; unit?: string }> = {
  cost: { key: "cost", label: "Cost", unit: "$" },
  clicks: { key: "clicks", label: "Clicks" },
  impressions: { key: "impressions", label: "Impressions" },
  conversions: { key: "conversions", label: "Conversions" },
  revenue: { key: "revenue", label: "Revenue", unit: "$" },
  reach: { key: "reach", label: "Reach" },
  frequency: { key: "frequency", label: "Frequency" },
  views: { key: "views", label: "Views" },
  "viewable impressions": { key: "viewable_impressions", label: "Viewable Impressions" },
  grps: { key: "grps", label: "GRPs" },
  trps: { key: "trps", label: "TRPs" },
  requests: { key: "requests", label: "Requests" },
  bids: { key: "bids", label: "Bids" },
  wins: { key: "wins", label: "Wins" },
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function shortHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 8);
}

function isAcronym(term: string): boolean {
  const cleaned = term.replace(/[^A-Za-z]/g, "");
  return cleaned.length > 0 && cleaned.length <= 10 && cleaned === cleaned.toUpperCase();
}

function looksLikeFormula(text: string | undefined): boolean {
  if (!text) return false;
  const pattern = /[*\/+\-]|%|\bper\b|\bdivided by\b/i;
  return pattern.test(text);
}

function normalizeCategory(category: string | undefined | null, term: string, hasFormula: boolean): string {
  if (category && category.trim().length > 0) {
    return category.trim();
  }
  if (hasFormula) return "Formula";
  if (isAcronym(term)) return "Acronym";
  return "Definition";
}

function inferFormula(formulaText: string): FormulaDSL | undefined {
  const lower = formulaText.toLowerCase();
  const foundTokens = Object.entries(TOKEN_MAP).filter(([token]) => lower.includes(token));
  if (!foundTokens.length) {
    return {
      expression: formulaText,
      variables: [],
      output: { label: "Result", unit: "" },
      format: "number",
      inferred: true,
      unmapped: true,
    };
  }

  const variables = foundTokens.map(([, meta]) => ({ ...meta, required: true }));
  const expression = foundTokens.reduce((expr, [token, meta]) => {
    const regex = new RegExp(token.replace(/\s+/g, "\\s+"), "gi");
    return expr.replace(regex, meta.key);
  }, lower);

  const format: FormulaDSL["format"] = lower.includes("%") || lower.includes(" * 100") ? "percent" : "number";

  return {
    expression,
    variables,
    output: { label: "Result", unit: format === "percent" ? "%" : "" },
    format,
    inferred: true,
  };
}

function clean(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^"|"$/g, "");
}

function parseLine(line: string): LearningTerm | null {
  const rawParts = line.split(",");
  if (!rawParts.length) return null;

  const header = rawParts[0]?.toLowerCase();
  if (header === "term") return null;

  let term = clean(rawParts[0]);
  if (!term) return null;

  if (term === "Term") return null;

  const isSixCol = rawParts.length >= 6;

  const canonicalTerm = isSixCol ? clean(rawParts[1]) || undefined : undefined;
  const category = clean(isSixCol ? rawParts[2] : rawParts[1]) || "";
  const definition = clean(isSixCol ? rawParts[4] : rawParts[2]) || "";
  const formula_or_notes = clean((isSixCol ? rawParts.slice(5) : rawParts.slice(3)).join(","));

  const key = term.toLowerCase();
  const isKnownFormula = Boolean(
    KNOWN_FORMULAS[key] ||
      (canonicalTerm ? KNOWN_FORMULAS[canonicalTerm.toLowerCase()] : undefined)
  );
  const hasFormula = isKnownFormula || looksLikeFormula(formula_or_notes);
  const normalizedCategory = normalizeCategory(category, term, hasFormula);
  const type: LearningType = hasFormula ? "formula" : isAcronym(term) ? "acronym" : "definition";

  const formula =
    hasFormula
      ? KNOWN_FORMULAS[key] || (canonicalTerm ? KNOWN_FORMULAS[canonicalTerm.toLowerCase()] : undefined) || inferFormula(formula_or_notes)
      : undefined;

  const idBase = `${term}-${normalizedCategory || "general"}`;
  const id = `${slugify(idBase)}-${shortHash(`${term}|${normalizedCategory}|${definition}|${formula_or_notes || ""}`)}`;

  const aliases: string[] = [];
  if (canonicalTerm && canonicalTerm !== term) {
    aliases.push(canonicalTerm);
  }

  return {
    id,
    term,
    canonicalTerm,
    aliases: aliases.length ? aliases : undefined,
    category: normalizedCategory,
    category_raw: category || null,
    definition,
    formula_or_notes: formula_or_notes || undefined,
    type,
    formula,
  };
}

function build() {
  if (!fs.existsSync(RAW_PATH)) {
    throw new Error(`Missing source CSV at ${RAW_PATH}`);
  }

  const raw = fs.readFileSync(RAW_PATH, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const termMap = new Map<string, LearningTerm>();
  const duplicateTerms = new Map<string, LearningTerm[]>();

  for (const line of lines) {
    const record = parseLine(line);
    if (record) {
      const termKey = record.term;
      if (termMap.has(termKey)) {
        const list = duplicateTerms.get(termKey) || [termMap.get(termKey)!];
        list.push(record);
        duplicateTerms.set(termKey, list);
      } else {
        termMap.set(termKey, record);
      }
    }
  }

  if (duplicateTerms.size) {
    const sample = Array.from(duplicateTerms.entries())
      .slice(0, 10)
      .map(([term, recs]) => {
        const defs = recs.map((r) => r.definition || "(blank)");
        return `${term}: ${recs.length} entries -> ${defs.join(" | ")}`;
      })
      .join("\n");

    throw new Error(
      `Duplicate terms detected (strict match). Please dedupe src/data/learning/terms.raw.csv.\n${sample}`,
    );
  }

  const records = Array.from(termMap.values());
  const sorted = records.sort((a, b) => a.term.localeCompare(b.term));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2), "utf8");

  console.log(`Wrote ${sorted.length} learning terms to ${OUTPUT_PATH}`);
}

try {
  build();
} catch (error) {
  console.error("Error building learning terms:", error);
  process.exit(1);
}

