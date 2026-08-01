import termsData from "../../data/learning/terms.json"
import type { LearningTerm, Section } from "./types"

const terms = termsData as LearningTerm[]

export function sectionForTermType(type: LearningTerm["type"]): Section {
  if (type === "acronym") return "acronyms"
  if (type === "formula") return "formulas"
  return "definitions"
}

/** Resolve a glossary term name to the correct Knowledge Hub section URL. */
export function hrefForGlossaryTerm(termName: string): string | null {
  const needle = termName.trim().toLowerCase()
  if (!needle) return null
  // AU TV: TARP ≈ GRP for trading language
  const synonyms: Record<string, string> = { tarp: "GRP" }
  const resolved = synonyms[needle] ?? termName.trim()
  const hit =
    terms.find((t) => t.term.toLowerCase() === resolved.toLowerCase()) ||
    terms.find((t) => (t.aliases ?? []).some((a) => a.toLowerCase() === resolved.toLowerCase())) ||
    terms.find((t) => t.term.toLowerCase() === needle) ||
    terms.find((t) => (t.aliases ?? []).some((a) => a.toLowerCase() === needle))
  if (!hit) return null
  const section = sectionForTermType(hit.type)
  return `/knowledge/${section}?q=${encodeURIComponent(hit.term)}&id=${encodeURIComponent(hit.id)}`
}

/** Best destination for a free-text Knowledge Hub search (home bar). */
export function hrefForKnowledgeSearch(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return "/knowledge/definitions"
  const exact =
    terms.find((t) => t.term.toLowerCase() === trimmed.toLowerCase()) ||
    terms.find((t) =>
      (t.aliases ?? []).some((a) => a.toLowerCase() === trimmed.toLowerCase())
    )
  if (exact) {
    const section = sectionForTermType(exact.type)
    return `/knowledge/${section}?q=${encodeURIComponent(trimmed)}&id=${encodeURIComponent(exact.id)}`
  }
  // Prefer formulas/acronyms for short ALL-CAPS tokens (CPM, ROAS, GRP…).
  if (/^[A-Z0-9]{2,8}$/i.test(trimmed)) {
    const upper = trimmed.toUpperCase()
    const loose = terms.find(
      (t) =>
        t.term.toUpperCase() === upper ||
        (t.aliases ?? []).some((a) => a.toUpperCase() === upper)
    )
    if (loose) {
      const section = sectionForTermType(loose.type)
      return `/knowledge/${section}?q=${encodeURIComponent(trimmed)}&id=${encodeURIComponent(loose.id)}`
    }
  }
  // Default: definitions search — section page still searches fuse across its type.
  // Also try opening formulas if the only exact-ish hits are formulas via fuse later.
  return `/knowledge/definitions?q=${encodeURIComponent(trimmed)}`
}

export function findTermByName(termName: string): LearningTerm | null {
  const needle = termName.trim().toLowerCase()
  return (
    terms.find((t) => t.term.toLowerCase() === needle) ||
    terms.find((t) => (t.aliases ?? []).some((a) => a.toLowerCase() === needle)) ||
    null
  )
}
