import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import { LearningTerm, Section, SortMode } from "./types";

export type SearchResult = {
  item: LearningTerm;
  score?: number;
};

const fuseOptions: IFuseOptions<LearningTerm> = {
  includeScore: true,
  shouldSort: true,
  threshold: 0.32,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: "term", weight: 0.5 },
    { name: "definition", weight: 0.3 },
    { name: "category", weight: 0.15 },
    { name: "aliases", weight: 0.1 },
    { name: "formula_or_notes", weight: 0.2 },
  ],
};

export function buildFuseIndex(terms: LearningTerm[]) {
  return new Fuse(terms, fuseOptions);
}

export function filterBySection(terms: LearningTerm[], section: Section): LearningTerm[] {
  switch (section) {
    case "definitions":
      return terms.filter((t) => t.type === "definition");
    case "acronyms":
      return terms.filter((t) => t.type === "acronym");
    case "formulas":
      return terms.filter((t) => t.type === "formula");
    default:
      return terms;
  }
}

export function filterByCategories(terms: LearningTerm[], categories: string[]): LearningTerm[] {
  if (!categories.length) return terms;
  const lowered = categories.map((c) => c.toLowerCase());
  return terms.filter((t) => lowered.includes((t.category || "").toLowerCase()));
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




























