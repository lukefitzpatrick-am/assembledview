// Pure UTM tagging logic for the Knowledge Hub UTM Builder.
// Free-form: we never enforce a taxonomy. We only (optionally) normalise case/spaces,
// always URL-encode values, and preserve any existing query string / fragment on the base URL.

export type UtmParams = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  id?: string;
};

export type UtmOptions = {
  lowercase: boolean;
  dashes: boolean; // convert runs of whitespace to a single hyphen
};

/** Canonical output order. */
export const UTM_ORDER: Array<[keyof UtmParams, string]> = [
  ["source", "utm_source"],
  ["medium", "utm_medium"],
  ["campaign", "utm_campaign"],
  ["id", "utm_id"],
  ["term", "utm_term"],
  ["content", "utm_content"],
];

export const REQUIRED_KEYS: Array<keyof UtmParams> = ["source", "medium", "campaign"];

export function normaliseValue(raw: string, opts: UtmOptions): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (opts.lowercase) s = s.toLowerCase();
  if (opts.dashes) s = s.replace(/\s+/g, "-");
  return s;
}

/** Which required params are still empty (for the soft hint). */
export function missingRequired(params: UtmParams): string[] {
  return REQUIRED_KEYS.filter((k) => !(params[k] ?? "").trim()).map(
    (k) => UTM_ORDER.find(([key]) => key === k)![1]
  );
}

/**
 * Build the tagged URL. Preserves an existing query string (appends with &) and
 * keeps any #fragment at the end. Values are URL-encoded (spaces become %20).
 * Returns the trimmed base unchanged if no params are set.
 */
export function buildUtmUrl(base: string, params: UtmParams, opts: UtmOptions): string {
  const b = (base ?? "").trim();

  const pairs = UTM_ORDER.map(([key, param]) => [param, normaliseValue(params[key] ?? "", opts)] as const)
    .filter(([, v]) => v !== "")
    .map(([param, v]) => `${param}=${encodeURIComponent(v)}`);

  if (pairs.length === 0) return b;
  if (!b) return `?${pairs.join("&")}`;

  const hashIdx = b.indexOf("#");
  const hash = hashIdx >= 0 ? b.slice(hashIdx) : "";
  const noHash = hashIdx >= 0 ? b.slice(0, hashIdx) : b;
  const sep = noHash.includes("?") ? (noHash.endsWith("?") || noHash.endsWith("&") ? "" : "&") : "?";

  return `${noHash}${sep}${pairs.join("&")}${hash}`;
}

/** Light, non-blocking base-URL sanity check. */
export function looksLikeUrl(base: string): boolean {
  const b = (base ?? "").trim();
  if (!b) return false;
  return /^https?:\/\/.+/i.test(b);
}
