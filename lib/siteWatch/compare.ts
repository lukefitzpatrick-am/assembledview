/**
 * What changed between two snapshots of one page (port of watch.py
 * `compare`). Severity is set separately (`severity.ts`).
 */
import type { PageFields, PageSnapshot } from "./extract"
import { lineDiff, type LineDiff } from "./lineDiff"

type ChangeCategory = "technical" | "tracking" | "content" | "visual"

export type DetectedChange = {
  /** Null for site-level changes (robots.txt, sitemap). */
  url: string | null
  category: ChangeCategory
  field: string
  before?: unknown
  after?: unknown
  diff?: LineDiff
}

const SCALARS = [
  "status", "final_url", "title", "meta_description", "canonical", "robots_meta",
  "x_robots", "og_title", "og_image", "inline_css",
] as const satisfies readonly (keyof PageFields)[]
const LISTS = ["h1", "hreflang", "schema_types", "script_hosts", "images"] as const satisfies readonly (keyof PageFields)[]
const VISUAL = new Set<string>(["inline_css", "images"])
/** Lists whose full value is small and read as a whole; the rest store removed and added. */
const WHOLE_LISTS = new Set<string>(["h1"])
const LIST_CAP = 50

function delta(a: readonly string[], b: readonly string[]) {
  const sa = new Set(a)
  const sb = new Set(b)
  return { removed: a.filter((x) => !sb.has(x)), added: b.filter((x) => !sa.has(x)) }
}

export type CompareOptions = { watchText: boolean; watchVisual: boolean }

export function comparePages(url: string, old: PageSnapshot, next: PageSnapshot, opts: CompareOptions): DetectedChange[] {
  const out: DetectedChange[] = []
  const a = old.fields
  const b = next.fields
  const push = (c: Omit<DetectedChange, "url">) => out.push({ url, ...c })

  for (const key of SCALARS) {
    const visual = VISUAL.has(key)
    if ((visual && !opts.watchVisual) || !(key in a)) continue // a field added after this snapshot was taken
    if (a[key] !== b[key]) push({ category: visual ? "visual" : "technical", field: key, before: a[key], after: b[key] })
  }
  for (const key of LISTS) {
    const visual = VISUAL.has(key)
    if ((visual && !opts.watchVisual) || !(key in a)) continue
    const before = a[key] ?? []
    const after = b[key] ?? []
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    const category = visual ? "visual" : "technical"
    if (WHOLE_LISTS.has(key)) {
      push({ category, field: key, before, after })
    } else {
      const d = delta(before, after)
      if (d.removed.length || d.added.length) {
        push({ category, field: key, before: d.removed.slice(0, LIST_CAP), after: d.added.slice(0, LIST_CAP) })
      }
    }
  }

  const kinds = new Set([...Object.keys(a.tracking ?? {}), ...Object.keys(b.tracking ?? {})])
  for (const kind of [...kinds].sort()) {
    const before = (a.tracking as Record<string, string[]>)[kind] ?? []
    const after = (b.tracking as Record<string, string[]>)[kind] ?? []
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      push({ category: "tracking", field: `tracking:${kind}`, before, after })
    }
  }

  if (opts.watchVisual) {
    const sa = a.stylesheets ?? {}
    const sb = b.stylesheets ?? {}
    const files = delta(Object.keys(sa).sort(), Object.keys(sb).sort())
    if (files.removed.length || files.added.length) {
      push({ category: "visual", field: "stylesheet_files", before: files.removed, after: files.added })
    }
    const edited = Object.keys(sb).filter((u) => u in sa && sa[u] !== sb[u]).sort()
    if (edited.length) push({ category: "visual", field: "stylesheet_content", after: edited })
    const layout = lineDiff(old.layout, next.layout)
    if (layout.total) push({ category: "visual", field: "layout", diff: layout })
  }
  if (opts.watchText) {
    const copy = lineDiff(old.text ? old.text.split("\n") : [], next.text ? next.text.split("\n") : [])
    if (copy.total) push({ category: "content", field: "page_text", diff: copy })
  }
  return out
}
