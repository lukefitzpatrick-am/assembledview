import { LearningTerm } from "./types";
import { SearchResult } from "./search";

export function getRelatedTerms(
  term: LearningTerm,
  all: LearningTerm[],
  searchResults: SearchResult[],
  limit = 6
): LearningTerm[] {
  const sameCategory = all.filter((t) => t.category === term.category && t.id !== term.id);
  const fuzzyRelated = searchResults
    .map((r) => r.item)
    .filter((item) => item.id !== term.id)
    .slice(0, limit * 2);

  const combined = [...sameCategory, ...fuzzyRelated];
  const seen = new Set<string>();
  const unique: LearningTerm[] = [];

  for (const candidate of combined) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    unique.push(candidate);
    if (unique.length >= limit) break;
  }

  return unique;
}
























