import fs from "fs";
import path from "path";

const EXCLUDE_DEFAULTS = new Set([
  "bursts",
  "totalMedia",
  "totalDeliverables",
  "totalFee",
  "overallDeliverables",
  "line_item",
  "lineItem",
  "line_item_id",
  "lineItemId",
  "_reactKey",
  "calculatedValue",
  "fee",
]);

const EXCLUDE_META_API = new Set([
  "media_plan_version",
  "mba_number",
  "mp_client_name",
  "mp_plannumber",
  "bursts",
  "feePct",
  "line_item",
  "line_item_id",
  "totalMedia",
  "total_media",
  "total_deliverables",
  "total_fee",
  "fee",
  "id",
]);

const EXCLUDE_HYDRATION = new Set([
  "bursts",
  "totalMedia",
  "totalDeliverables",
  "totalFee",
  "line_item",
  "lineItem",
  "line_item_id",
  "lineItemId",
]);

const containers = [
  ["ProgDisplay", "ProgDisplayContainer.tsx"],
  ["ProgVideo", "ProgVideoContainer.tsx"],
  ["ProgBVOD", "ProgBVODContainer.tsx"],
  ["ProgAudio", "ProgAudioContainer.tsx"],
  ["ProgOOH", "ProgOOHContainer.tsx"],
  ["DigitalDisplay", "DigitalDisplayContainer.tsx"],
  ["DigitalVideo", "DigitalVideoContainer.tsx"],
  ["DigitalAudio", "DigitalAudioContainer.tsx"],
  ["BVOD", "BVODContainer.tsx"],
  ["Television", "TelevisionContainer.tsx"],
  ["Radio", "RadioContainer.tsx"],
  ["Search", "SearchContainer.tsx"],
  ["SocialMedia", "SocialMediaContainer.tsx"],
  ["Influencers", "InfluencersContainer.tsx"],
  ["Integration", "IntegrationContainer.tsx"],
  ["OOH", "OOHContainer.tsx"],
  ["Cinema", "CinemaContainer.tsx"],
  ["Newspaper", "NewspaperContainer.tsx"],
  ["Magazines", "MagazinesContainer.tsx"],
  ["Production", "ProductionContainer.tsx"],
];

const dir = "c:/Projects/avmediaplan/components/media-containers";

function stripComments(src) {
  let out = "";
  let i = 0;
  let inStr = null;
  let esc = false;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inStr) {
      out += c;
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === inStr) {
        inStr = null;
      }
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function extractBalancedObject(src, startIdx) {
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  return null;
}

/** Parse top-level object props; supports `key: value` and ES shorthand `key,` */
function parseTopLevelProps(objSrc) {
  const props = [];
  let depth = 0;
  let inStr = null;
  let esc = false;
  let keyStart = -1;

  const flushShorthand = (endIdx) => {
    if (keyStart < 0) return;
    const key = objSrc.slice(keyStart, endIdx).trim();
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      props.push({ key, value: key, shorthand: true });
    }
    keyStart = -1;
  };

  for (let i = 0; i < objSrc.length; i++) {
    const c = objSrc[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{" || c === "[" || c === "(") {
      depth++;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      if (depth === 1 && keyStart >= 0) flushShorthand(i);
      depth--;
      continue;
    }
    if (depth !== 1) continue;

    if (/[a-zA-Z_]/.test(c) && keyStart < 0) {
      keyStart = i;
      continue;
    }
    if (keyStart < 0) continue;

    if (c === ":") {
      const key = objSrc.slice(keyStart, i).trim();
      let j = i + 1;
      let d2 = 1;
      let inS2 = null;
      let esc2 = false;
      const valStart = j;
      while (j < objSrc.length) {
        const cj = objSrc[j];
        if (inS2) {
          if (esc2) {
            esc2 = false;
            j++;
            continue;
          }
          if (cj === "\\") {
            esc2 = true;
            j++;
            continue;
          }
          if (cj === inS2) inS2 = null;
          j++;
          continue;
        }
        if (cj === "'" || cj === '"' || cj === "`") {
          inS2 = cj;
          j++;
          continue;
        }
        if (cj === "{" || cj === "[" || cj === "(") {
          d2++;
          j++;
          continue;
        }
        if (cj === "}" || cj === "]" || cj === ")") {
          d2--;
          if (d2 === 0) {
            const val = objSrc.slice(valStart, j).trim().replace(/,$/, "").trim();
            props.push({ key, value: val });
            keyStart = -1;
            i = j - 1;
            break;
          }
          j++;
          continue;
        }
        if (cj === "," && d2 === 1) {
          const val = objSrc.slice(valStart, j).trim();
          props.push({ key, value: val });
          keyStart = -1;
          i = j;
          break;
        }
        j++;
      }
      continue;
    }

    if (c === ",") {
      flushShorthand(i);
      continue;
    }

    if (!/[a-zA-Z0-9_]/.test(c) && c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
      keyStart = -1;
    }
  }
  return props;
}

function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(s) {
  if (s === "noadserving" || s === "noAdserving") return "no_adserving";
  return s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

function classifyDefault(val) {
  const v = val.trim();
  if (v === "false" || v === "true") return JSON.parse(v);
  if (v === '""' || v === "''") return "";
  if (v === "0") return 0;
  if (v.startsWith("[") || v.startsWith("{") || v.startsWith("(")) return "[complex]";
  return v.replace(/^['"]|['"]$/g, "");
}

function resolveLocalConst(block, name) {
  if (!block) return null;
  const re = new RegExp(
    `(?:const|let)\\s+${name}\\s*=\\s*([^;\\n]+)`,
    "m"
  );
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function parseHydrationMapping(val, formKey, hydBlock) {
  let v = val.replace(/\s+/g, " ").trim();
  if (v === formKey || /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) {
    const resolved = resolveLocalConst(hydBlock, v);
    if (resolved) v = resolved;
  }

  let m = v.match(/^item\.([a-zA-Z0-9_]+)\s*\|\|\s*(""|''|false|true|0)/);
  if (m) {
    return {
      apiKey: m[1],
      logic: "|| " + m[2].replace(/''/, '""'),
    };
  }
  m = v.match(/^Boolean\(\s*item\.([a-zA-Z0-9_]+)/);
  if (m) return { apiKey: m[1], logic: "Boolean(item." + m[1] + "...)" };
  m = v.match(
    /^Boolean\(\s*item\.([a-zA-Z0-9_]+)\s*\|\|\s*item\.([a-zA-Z0-9_]+)/
  );
  if (m) {
    return {
      apiKey: m[1],
      logic: `Boolean(item.${m[1]} || item.${m[2]})`,
      alt: m[2],
    };
  }
  m = v.match(/^item\.([a-zA-Z0-9_]+)\s*\|\|\s*item\.([a-zA-Z0-9_]+)\s*\|\|\s*(""|''|false)/);
  if (m) {
    return {
      apiKey: m[1],
      logic: `item.${m[1]} || item.${m[2]} || ${m[3]}`,
      alt: m[2],
    };
  }
  m = v.match(/^item\.([a-zA-Z0-9_]+)\s*\|\|\s*item\.([a-zA-Z0-9_]+)/);
  if (m) {
    return {
      apiKey: m[1],
      logic: `item.${m[1]} || item.${m[2]}`,
      alt: m[2],
    };
  }
  m = v.match(/^item\.([a-zA-Z0-9_]+)\s*\?\?/);
  if (m) return { apiKey: m[1], logic: "?? ..." };
  m = v.match(/^item\.([a-zA-Z0-9_]+)/);
  if (m) return { apiKey: m[1], logic: "direct/special: " + v.slice(0, 120) };
  return { apiKey: null, logic: "special: " + v.slice(0, 150) };
}

function parseApiMapping(val) {
  const v = val.replace(/\s+/g, " ").trim();
  if (v === '""' || v === "''") return { formKey: null, logic: "literal empty string" };
  let m = v.match(/^lineItem\.([a-zA-Z0-9_]+)\s*(\|\||\?\?)/);
  if (m) return { formKey: m[1], logic: m[2] + " ..." };
  m = v.match(/^lineItem\.([a-zA-Z0-9_]+)/);
  if (m) return { formKey: m[1], logic: "direct" };
  m = v.match(/\(lineItem as[^)]*\)\.([a-zA-Z0-9_]+)/);
  if (m) return { formKey: m[1], logic: "cast" };
  return { formKey: null, logic: "special: " + v.slice(0, 120) };
}

function extractSchema(src) {
  const patterns = [
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/mediaplan\/schemas[^'"]*['"]/,
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/schemas\/[^'"]+['"]/,
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m) {
      const names = m[1]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/).pop())
        .filter(Boolean);
      const schema = names.find((n) => /Schema$|FormSchema$/i.test(n));
      if (schema) return schema;
    }
  }
  const z = src.match(/zodResolver\((\w+)/);
  return z ? z[1] : null;
}

function extractMediaType(src) {
  const ms = src.match(/mediaTypeString\s*[=:]\s*['"]([^'"]+)['"]/);
  const codes = [...src.matchAll(/MEDIA_TYPE_ID_CODES\.(\w+)/g)].map((x) => x[1]);
  return {
    mediaTypeString: ms ? ms[1] : null,
    mediaTypeIdCode: codes[0] || null,
  };
}

function extractExpertMappers(src) {
  const to = [...src.matchAll(/\b(map\w+ToExpertRows)\b/g)].map((m) => m[1]);
  const from = [...src.matchAll(/\b(map\w+FromExpertRows)\b/g)].map((m) => m[1]);
  return {
    toExpertAll: [...new Set(to)],
    fromExpertAll: [...new Set(from)],
  };
}

function extractCalculatedVariant(src) {
  const m = src.match(/calculatedVariant\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

function hasFetchPublishers(src) {
  return /const fetchPublishers\s*=/.test(src) ? "fetchPublishers" : null;
}

function detectOverlays(hydRaw, apiRaw, src, short) {
  const hydNotes = [];
  const apiNotes = [];
  const appendNotes = [];

  if (hydRaw) {
    if (/platform:\s*item\.platform\s*\|\|\s*item\.publisher/.test(hydRaw)) {
      hydNotes.push("platform: item.platform || item.publisher");
    }
    if (/publisher:\s*item\.publisher\s*\|\|\s*item\.platform/.test(hydRaw)) {
      hydNotes.push("publisher: item.publisher || item.platform");
    }
    if (/platform:\s*item\.platform\s*\|\|\s*item\.site/.test(hydRaw)) {
      hydNotes.push("platform: item.platform || item.site");
    }
    if (/market:\s*item\.market\s*\|\|\s*item\.placement/.test(hydRaw)) {
      hydNotes.push("market: item.market || item.placement");
    }
    if (/creative:\s*item\.creative\s*\|\|/.test(hydRaw)) {
      hydNotes.push("creative multi-fallback overlay");
    }
    if (/size:\s*[^\n]*bursts/.test(hydRaw) || /size:\s*parsedBursts/.test(hydRaw)) {
      hydNotes.push("size lifted from first burst onto line item");
    }
    if (/tarps:\s*[^\n]*bursts/.test(hydRaw) || /tarps:\s*parsedBursts/.test(hydRaw)) {
      hydNotes.push("tarps lifted from first burst onto line item");
    }
    if (/unitRate:/.test(hydRaw) && /unit_cost|unitCost/.test(hydRaw)) {
      hydNotes.push("unitRate ← unitRate ?? unitCost ?? unit_cost ?? first burst");
    }
  }

  if (apiRaw) {
    if (/platform:\s*lineItem\.platform\s*\|\|\s*lineItem\.publisher/.test(apiRaw)) {
      apiNotes.push("platform: lineItem.platform || lineItem.publisher");
    }
    if (/publisher:\s*lineItem\.publisher\s*\|\|\s*lineItem\.platform/.test(apiRaw)) {
      apiNotes.push("publisher: lineItem.publisher || lineItem.platform");
    }
    if (/format:\s*""/.test(apiRaw)) {
      apiNotes.push("format: \"\" literal (no form field)");
    }
    if (/unitRate:\s*lineItem\.unitRate/.test(apiRaw)) {
      apiNotes.push("unitRate kept camelCase on API object");
    }
  }

  if (/hasProcessedInitialLineItemsRef/.test(src)) {
    hydNotes.push("skip-duplicate hydration guard via ref");
  }
  if (short === "Integration" && /Deduped|dedupe|unique/i.test(src)) {
    hydNotes.push("dedupe of initialLineItems before map");
  }
  if (/buildLineItemId\(/.test(src) && /useStableHydration/.test(src)) {
    const hydBlock = src.slice(
      src.indexOf("useStableHydration"),
      src.indexOf("useStableHydration") + 6000
    );
    if (/buildLineItemId\(/.test(hydBlock)) {
      hydNotes.push("lineItemId/line_item_id via buildLineItemId(...)");
    }
  }

  return {
    hydration: hydNotes.length ? [...new Set(hydNotes)].join("; ") : null,
    api: apiNotes.length ? [...new Set(apiNotes)].join("; ") : null,
    append: appendNotes.length ? appendNotes.join("; ") : null,
  };
}

function findDefaultsArrayKey(src, dvIdx) {
  const window = src.slice(dvIdx, dvIdx + 1200);
  const m = window.match(/\b(\w*lineItems)\s*:/);
  return m ? m[1] : null;
}

function extractDefaultsLineItem(src) {
  const dvIdx = src.indexOf("defaultValues:");
  if (dvIdx < 0) return [];
  const arrKey = findDefaultsArrayKey(src, dvIdx);
  if (!arrKey) return [];
  const keyIdx = src.indexOf(arrKey + ":", dvIdx);
  const arrStart = src.indexOf("[", keyIdx);
  const objStart = src.indexOf("{", arrStart);
  const obj = extractBalancedObject(src, objStart);
  if (!obj) return [];
  return parseTopLevelProps(obj).filter((p) => !EXCLUDE_DEFAULTS.has(p.key));
}

function extractHydrationReturn(src) {
  const usIdx = src.indexOf("useStableHydration");
  if (usIdx < 0) return { props: [], raw: null, block: null };
  const blockEnd = src.indexOf("form.reset(", usIdx);
  const block = src.slice(usIdx, blockEnd > 0 ? blockEnd : usIdx + 14000);
  let searchFrom = 0;
  let best = null;
  while (true) {
    const rIdx = block.indexOf("return {", searchFrom);
    if (rIdx < 0) break;
    const brace = block.indexOf("{", rIdx);
    const obj = extractBalancedObject(block, brace);
    if (
      obj &&
      obj.length > 80 &&
      (obj.includes("platform:") ||
        obj.includes("publisher:") ||
        obj.includes("network:") ||
        obj.includes("buyType") ||
        obj.includes("mediaType:") ||
        obj.includes("station:") ||
        obj.includes("objective:") ||
        obj.includes("unitRate"))
    ) {
      best = obj;
    }
    searchFrom = rIdx + 8;
  }
  if (!best) return { props: [], raw: null, block };
  const props = parseTopLevelProps(best).filter((p) => !EXCLUDE_HYDRATION.has(p.key));
  return { props, raw: best, block };
}

function looksLikeApiLineItemPayload(obj) {
  if (!obj || obj.length < 40) return false;
  const hasLineItemRef = /lineItem\./.test(obj);
  const snakeHits = [
    "buy_type",
    "bid_strategy",
    "no_adserving",
    "mba_number",
    "media_plan_version",
    "buying_demo",
    "creative_targeting",
    "media_type",
    "fixed_cost_media",
  ].filter((k) => obj.includes(k + ":")).length;
  // Production uses camelCase unitRate + media_type
  const prodHits =
    obj.includes("media_type:") && obj.includes("unitRate:") && hasLineItemRef;
  return (hasLineItemRef && snakeHits >= 2) || prodHits || snakeHits >= 4;
}

function extractApiReturn(src) {
  // Prefer publish call region (comments may be stripped, so do not rely on them)
  const regions = [];
  const apiMemo = src.indexOf("const apiLineItems = useMemo");
  if (apiMemo >= 0) {
    const pub = src.indexOf("publishMediaLineItemsIfChanged", apiMemo);
    regions.push(src.slice(apiMemo, pub > 0 ? pub + 80 : apiMemo + 5000));
  }
  let pubSearch = 0;
  while (true) {
    const pub = src.indexOf("publishMediaLineItemsIfChanged", pubSearch);
    if (pub < 0) break;
    const ue = src.lastIndexOf("useEffect(", pub);
    const start = ue >= 0 ? ue : Math.max(0, pub - 12000);
    regions.push(src.slice(start, pub));
    pubSearch = pub + 1;
  }
  // Fallback: any map returning snake_case line-item fields
  if (regions.length === 0) {
    regions.push(src);
  }

  let best = null;
  let bestScore = 0;
  const consider = (obj) => {
    if (!looksLikeApiLineItemPayload(obj)) return;
    const score =
      (obj.match(/_[a-z]+:/g) || []).length +
      (obj.includes("lineItem.") ? 10 : 0) +
      (obj.includes("mba_number") ? 5 : 0) +
      (obj.includes("unitRate:") ? 8 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  };
  for (const searchRegion of regions) {
    let searchFrom = 0;
    while (true) {
      const rIdx = searchRegion.indexOf("return {", searchFrom);
      if (rIdx < 0) break;
      const brace = searchRegion.indexOf("{", rIdx);
      consider(extractBalancedObject(searchRegion, brace));
      searchFrom = rIdx + 8;
    }
    // Production / some containers: .map((lineItem) => ({ ... }))
    searchFrom = 0;
    while (true) {
      const m = searchRegion.slice(searchFrom).search(/\.map\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\(\s*\{/);
      if (m < 0) break;
      const abs = searchFrom + m;
      const brace = searchRegion.indexOf("{", abs);
      consider(extractBalancedObject(searchRegion, brace));
      searchFrom = abs + 10;
    }
  }
  if (!best) return { props: [], raw: null };
  const props = parseTopLevelProps(best).filter((p) => !EXCLUDE_META_API.has(p.key));
  return { props, raw: best };
}

function detectNoAdSpelling(defaults, hydrationMaps, apiMaps) {
  const keys = [
    ...defaults.map((d) => d.key),
    ...hydrationMaps.map((h) => h.camel),
    ...apiMaps.map((a) => a.formKey).filter(Boolean),
  ];
  const hasNoad = keys.some((k) => k === "noadserving");
  const hasNoAd = keys.some((k) => k === "noAdserving");
  if (hasNoad && hasNoAd) return "mixed: noadserving + noAdserving";
  if (hasNoad) return "noadserving";
  if (hasNoAd) return "noAdserving";
  if (apiMaps.some((a) => a.snake === "no_adserving")) {
    return "api-only no_adserving (form spelling unknown)";
  }
  return null;
}

function guessSnake(camel, hydApiKey) {
  if (hydApiKey && hydApiKey.includes("_")) return hydApiKey;
  if (hydApiKey && hydApiKey === camel) return camelToSnake(camel);
  if (hydApiKey && /^[a-z]+(_[a-z]+)+$/.test(hydApiKey)) return hydApiKey;
  return camelToSnake(camel);
}

function fieldInApi(camel, snake, apiMaps, apiSnakeKeys, apiFormKeys) {
  if (apiFormKeys.includes(camel)) return true;
  if (apiSnakeKeys.includes(snake)) return true;
  // Production keeps camelCase on API payload
  if (apiSnakeKeys.includes(camel)) return true;
  if (apiMaps.some((a) => a.snake === camel && a.formKey === camel)) return true;
  return false;
}

const results = {};
const summary = { clean: [], diffs: [], influencersNotes: null, integrationNotes: null };

for (const [short, file] of containers) {
  const fp = path.join(dir, file);
  const rawSrc = fs.readFileSync(fp, "utf8");
  const src = stripComments(rawSrc);
  const defaults = extractDefaultsLineItem(src);
  const hyd = extractHydrationReturn(src);
  const api = extractApiReturn(src);
  const schema = extractSchema(src);
  const mt = extractMediaType(src);
  const expert = extractExpertMappers(src);
  const calc = extractCalculatedVariant(src);
  const fetchPub = hasFetchPublishers(src);
  const hasBursts = /bursts\s*:/.test(src) && /resolveLineItemBursts/.test(src);

  const defaultKeys = defaults.map((d) => d.key);
  const hydrationMaps = hyd.props.map((p) => {
    const m = parseHydrationMapping(p.value, p.key, hyd.block);
    return {
      camel: p.key,
      apiKey: m.apiKey,
      logic: m.logic,
      raw: p.value.replace(/\s+/g, " ").slice(0, 200),
      shorthand: !!p.shorthand,
    };
  });
  const apiMaps = api.props.map((p) => {
    const m = parseApiMapping(p.value);
    return {
      snake: p.key,
      formKey: m.formKey,
      logic: m.logic,
      raw: p.value.replace(/\s+/g, " ").slice(0, 200),
    };
  });

  const hydKeys = hydrationMaps.map((h) => h.camel);
  const apiFormKeys = apiMaps.map((a) => a.formKey).filter(Boolean);
  const apiSnakeKeys = apiMaps.map((a) => a.snake);

  const allCamels = new Set([...defaultKeys, ...hydKeys, ...apiFormKeys]);
  for (const a of apiMaps) {
    if (!a.formKey) {
      // camelCase API keys (Production unitRate)
      if (/[A-Z]/.test(a.snake)) allCamels.add(a.snake);
      else allCamels.add(snakeToCamel(a.snake));
    }
  }

  const fieldMapCandidates = [];
  for (const camel of [...allCamels].sort()) {
    const d = defaults.find((x) => x.key === camel);
    const h = hydrationMaps.find((x) => x.camel === camel);
    const a =
      apiMaps.find((x) => x.formKey === camel) ||
      apiMaps.find((x) => x.snake === camel) ||
      apiMaps.find((x) => snakeToCamel(x.snake) === camel && !x.formKey);
    const snake = guessSnake(camel, h?.apiKey || (a?.snake?.includes("_") ? a.snake : null) || a?.snake || null);
    const inDefaults = !!d;
    const inHydration = !!h;
    const inApi = fieldInApi(camel, snake, apiMaps, apiSnakeKeys, apiFormKeys);
    fieldMapCandidates.push({
      camel,
      snake,
      default: d ? classifyDefault(d.value) : null,
      inDefaults,
      inHydration,
      inApi,
      excel: null,
      hydrationLogic: h?.logic || null,
      apiLogic: a?.logic || null,
    });
  }

  const defaultsOnly = defaultKeys.filter((k) => !hydKeys.includes(k));
  const hydrationOnly = hydKeys.filter((k) => !defaultKeys.includes(k));
  const apiOnly = [];
  for (const a of apiMaps) {
    if (a.formKey) {
      if (!defaultKeys.includes(a.formKey) && !hydKeys.includes(a.formKey)) {
        apiOnly.push(a.formKey);
      }
    } else if (a.logic === "literal empty string" || a.logic.startsWith("special")) {
      const label = `${a.snake}(no formKey)`;
      if (!apiOnly.includes(label)) apiOnly.push(label);
    } else if (/[A-Z]/.test(a.snake)) {
      // camelCase API key with no parseable formKey — still check
      if (!defaultKeys.includes(a.snake) && !hydKeys.includes(a.snake)) {
        apiOnly.push(`${a.snake}(api camelKey)`);
      }
    }
  }

  const missingFromApi = defaultKeys.filter((k) => {
    const h = hydrationMaps.find((x) => x.camel === k);
    const sn = guessSnake(k, h?.apiKey || null);
    return !fieldInApi(k, sn, apiMaps, apiSnakeKeys, apiFormKeys);
  });
  const missingFromHydration = defaultKeys.filter((k) => !hydKeys.includes(k));

  const overlays = detectOverlays(hyd.raw, api.raw, src, short);

  const noAdServingSpelling = detectNoAdSpelling(defaults, hydrationMaps, apiMaps);
  const toExpert =
    expert.toExpertAll.find((n) => n.startsWith("mapStandard")) || expert.toExpertAll[0] || null;
  const fromExpert =
    expert.fromExpertAll.find((n) => n.startsWith("mapStandard") || n.includes("FromExpert")) ||
    expert.fromExpertAll[0] ||
    null;

  results[short] = {
    defaultsOnly,
    hydrationOnly,
    apiOnly,
    missingFromApi,
    missingFromHydration,
    fieldMapCandidates,
    overlays,
    meta: {
      mediaTypeString: mt.mediaTypeString,
      mediaTypeIdCode: mt.mediaTypeIdCode,
      schema,
      fetchPublishers: fetchPub,
      toExpert,
      fromExpert,
      hasBursts,
      calculatedVariant: calc,
      noAdServingSpelling,
      defaultKeys,
      hydrationMaps,
      apiMaps,
    },
  };

  const isClean =
    defaultsOnly.length === 0 &&
    hydrationOnly.length === 0 &&
    apiOnly.length === 0 &&
    missingFromApi.length === 0 &&
    missingFromHydration.length === 0;

  if (isClean) summary.clean.push(short);
  else {
    summary.diffs.push({
      channel: short,
      defaultsOnly,
      hydrationOnly,
      apiOnly,
      missingFromApi,
      missingFromHydration,
      noAdServingSpelling,
    });
  }

  if (short === "Influencers") {
    summary.influencersNotes = {
      defaults: defaultKeys,
      hydration: hydrationMaps,
      api: apiMaps,
      noAdServingSpelling,
      defaultsOnly,
      hydrationOnly,
      missingFromApi,
      overlays,
    };
  }
  if (short === "Integration") {
    summary.integrationNotes = {
      defaults: defaultKeys,
      hydration: hydrationMaps,
      api: apiMaps,
      noAdServingSpelling,
      defaultsOnly,
      hydrationOnly,
      missingFromApi,
      overlays,
    };
  }
}

const out = { ...results, _summary: summary };
fs.mkdirSync("c:/Projects/avmediaplan/scripts", { recursive: true });
fs.writeFileSync(
  "c:/Projects/avmediaplan/scripts/tmp-container-fieldset-diffs.json",
  JSON.stringify(out, null, 2)
);

console.log("Wrote", Object.keys(results).length, "channels");
console.log("CLEAN:", summary.clean.join(", ") || "(none)");
console.log("DIFFS:");
for (const d of summary.diffs) {
  console.log(
    "-",
    d.channel,
    JSON.stringify({
      defaultsOnly: d.defaultsOnly,
      hydrationOnly: d.hydrationOnly,
      apiOnly: d.apiOnly,
      missingFromApi: d.missingFromApi,
      missingFromHydration: d.missingFromHydration,
      spelling: d.noAdServingSpelling,
    })
  );
}
