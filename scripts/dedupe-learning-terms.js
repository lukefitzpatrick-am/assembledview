import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Dedupe learning terms so each term appears once.
 * Reads the already-built JSON (clean structure) and writes a new raw CSV.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_JSON = path.join(ROOT, "src", "data", "learning", "terms.json");
const OUTPUT_RAW = path.join(ROOT, "src", "data", "learning", "terms.raw.csv");

function csvSafe(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function score(entry) {
  const def = (entry.definition || "").trim();
  const notes = (entry.formula_or_notes || "").trim();
  const cat = (entry.category || "").trim();
  let score = 0;
  if (entry.type === "formula") score += 200;
  if (notes) score += 80 + notes.length * 0.5;
  if (/[*\/+\-]|%|\bper\b/i.test(notes)) score += 20;
  if (def) score += 50 + def.length;
  if (cat) score += 10 + cat.length * 0.1;
  return score;
}

function dedupe() {
  if (!fs.existsSync(INPUT_JSON)) {
    throw new Error(`Missing input JSON at ${INPUT_JSON}`);
  }

  const terms = JSON.parse(fs.readFileSync(INPUT_JSON, "utf8"));
  const groups = new Map();

  for (const term of terms) {
    if (!term.term) continue;
    if (!groups.has(term.term)) groups.set(term.term, []);
    groups.get(term.term).push(term);
  }

  const deduped = [];

  for (const [term, entries] of groups.entries()) {
    const best = entries.reduce((prev, curr) => (score(curr) > score(prev) ? curr : prev), entries[0]);
    deduped.push({
      term,
      category: (best.category || "").trim(),
      definition: (best.definition || "").trim(),
      formula_or_notes: (best.formula_or_notes || "").trim(),
    });
  }

  deduped.sort((a, b) => a.term.localeCompare(b.term));

  const lines = [
    "Term,Category,Definition,Formula_or_Notes",
    ...deduped.map((t) =>
      [
        csvSafe(t.term),
        csvSafe(t.category),
        csvSafe(t.definition),
        csvSafe(t.formula_or_notes),
      ].join(","),
    ),
  ];

  fs.writeFileSync(OUTPUT_RAW, lines.join("\n"), "utf8");
  console.log(`Deduped ${terms.length} records down to ${deduped.length} unique terms.`);
}

dedupe();

