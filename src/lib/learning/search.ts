import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import { LearningTerm, SortMode } from "./types";

export type SearchResult = {
  item: LearningTerm;
  score?: number;
};

const fuseOptions: IFuseOptions<LearningTerm> = {
  includeScore: true,
  shouldSort: true,
  // Slightly looser so short headline terms (CPM, GRP, ROAS) still rank.
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: "term", weight: 0.55 },
    { name: "aliases", weight: 0.35 },
    { name: "definition", weight: 0.25 },
    { name: "plainEnglish", weight: 0.2 },
    { name: "category", weight: 0.1 },
    { name: "whyItMatters", weight: 0.1 },
    { name: "formula_or_notes", weight: 0.15 },
  ],
};

export function buildFuseIndex(terms: LearningTerm[]) {
  return new Fuse(terms, fuseOptions);
}

/**
 * Exact term/alias hits first (score 0), then Fuse. Ensures glossary headline
 * terms like CPM/ROAS/GRP/VOZ are never lost to fuzzy noise or type filters upstream.
 */
export function searchTerms(fuse: Fuse<LearningTerm>, terms: LearningTerm[], query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return terms.map((item) => ({ item }));
  }
  const needle = trimmed.toLowerCase();
  const exact = terms.filter(
    (t) =>
      t.term.toLowerCase() === needle ||
      (t.aliases ?? []).some((a) => a.toLowerCase() === needle)
  );
  const exactIds = new Set(exact.map((t) => t.id));
  const fuzzy = fuse
    .search(trimmed)
    .filter((m) => !exactIds.has(m.item.id))
    .map((m) => ({ item: m.item, score: m.score }));
  return [...exact.map((item) => ({ item, score: 0 })), ...fuzzy];
}

export function sortResults(items: SearchResult[], sort: SortMode, recentOrder: Record<string, number>): SearchResult[] {
  if (sort === "recent") {
    return [...items].sort((a, b) => {
      const aScore = recentOrder[a.item.id] ?? Number.POSITIVE_INFINITY;
      const bScore = recentOrder[b.item.id] ?? Number.POSITIVE_INFINITY;
      if (aScore === bScore) return a.item.term.localeCompare(b.item.term);
      return aScore - bScore;
    });
  }

  if (sort === "alpha" || (!items.some((r) => typeof r.score === "number") && sort === "relevance")) {
    return [...items].sort((a, b) => a.item.term.localeCompare(b.item.term));
  }

  // relevance with scores (lower is better)
  return [...items].sort((a, b) => {
    if (a.score === undefined && b.score === undefined) return a.item.term.localeCompare(b.item.term);
    if (a.score === undefined) return 1;
    if (b.score === undefined) return -1;
    return a.score - b.score;
  });
}




























