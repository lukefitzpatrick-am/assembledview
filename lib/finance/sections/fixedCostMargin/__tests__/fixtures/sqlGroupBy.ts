/**
 * B31fix2 H1 guard: checks a rendered single SELECT ... GROUP BY statement the
 * way Postgres would on two points, without a database.
 *
 * - Every GROUP BY ordinal names a select column that exists and holds no
 *   aggregate (Postgres 42803 "aggregate functions are not allowed in GROUP BY").
 * - Every select column without an aggregate is grouped: by its ordinal, or it
 *   reads only columns grouped by name (Postgres 42803 "must appear in the
 *   GROUP BY clause").
 *
 * Fails closed: anything it can't parse is a problem, never a pass (comments,
 * more than one SELECT or GROUP BY at the top level, a window function, a
 * select column without "AS alias", a GROUP BY item that is neither an ordinal
 * nor `alias.column`, or anything after the GROUP BY list).
 */

const AGGREGATE_RE =
  /\b(sum|count|min|max|avg|array_agg|string_agg|json_agg|jsonb_agg|json_object_agg|jsonb_object_agg|xmlagg|bool_and|bool_or|every|bit_and|bit_or|bit_xor|stddev|stddev_pop|stddev_samp|variance|var_pop|var_samp|percentile_cont|percentile_disc|mode|corr|covar_pop|covar_samp|regr_[a-z]+|any_value|range_agg|range_intersect_agg)\s*\(/i
const COLUMN_REF_RE = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi
const NAMED_GROUP_RE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i
const ALIASED_RE = /^([\s\S]*\S)\s+AS\s+([a-z_][a-z0-9_]*)$/i

export type SelectColumn = { position: number; expression: string; alias: string; aggregate: boolean }

export type GroupByCheck = { columns: SelectColumn[]; groupBy: string[]; problems: string[] }

/**
 * The text with string literals and quoted identifiers blanked to spaces (same
 * length), so commas, brackets and keywords inside them are not read. Null
 * when a quote is never closed.
 */
function blankQuoted(text: string): string | null {
  let out = ""
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (ch === "'" || ch === '"') {
      let j = i + 1
      for (;;) {
        if (j >= text.length) return null
        if (text[j] === ch) {
          if (text[j + 1] === ch) {
            j += 2
            continue
          }
          break
        }
        j += 1
      }
      out += ch + " ".repeat(j - i - 1) + ch
      i = j + 1
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/** Bracket depth before each character of `masked`. Null when brackets don't balance. */
function depths(masked: string): number[] | null {
  const d: number[] = []
  let depth = 0
  for (const ch of masked) {
    d.push(depth)
    if (ch === "(") depth += 1
    else if (ch === ")") {
      depth -= 1
      if (depth < 0) return null
    }
  }
  return depth === 0 ? d : null
}

/** Start offsets of a keyword at bracket depth 0 (word bounded, any case). */
function topLevel(masked: string, depth: number[], keyword: RegExp): number[] {
  const out: number[] = []
  const re = new RegExp(keyword.source, "gi")
  for (const m of masked.matchAll(re)) {
    const at = m.index ?? -1
    const before = at > 0 ? masked[at - 1]! : " "
    const after = masked[at + m[0].length] ?? " "
    if (/[a-z0-9_]/i.test(before) || /[a-z0-9_]/i.test(after)) continue
    if (depth[at] === 0) out.push(at)
  }
  return out
}

/** Split [start, end) of `text` at depth-0 commas (positions read from `masked`). */
function splitTopLevel(text: string, masked: string, depth: number[], start: number, end: number): string[] {
  const parts: string[] = []
  let from = start
  for (let i = start; i < end; i += 1) {
    if (masked[i] === "," && depth[i] === 0) {
      parts.push(text.slice(from, i).trim())
      from = i + 1
    }
  }
  parts.push(text.slice(from, end).trim())
  return parts
}

export function checkGroupBy(sqlText: string): GroupByCheck {
  const problems: string[] = []
  const fail = (p: string): GroupByCheck => ({ columns: [], groupBy: [], problems: [...problems, p] })

  const masked = blankQuoted(sqlText)
  if (masked == null) return fail("unparsed: an unclosed quote")
  if (/--|\/\*/.test(masked)) return fail("unparsed: a comment outside a string")
  if (/\bover\s*\(/i.test(masked)) return fail("unparsed: a window function (OVER)")
  const depth = depths(masked)
  if (depth == null) return fail("unparsed: brackets don't balance")

  const selects = topLevel(masked, depth, /select/)
  const froms = topLevel(masked, depth, /from/)
  const groups = topLevel(masked, depth, /group\s+by/)
  if (selects.length !== 1) return fail(`unparsed: ${selects.length} top-level SELECTs`)
  if (froms.length !== 1) return fail(`unparsed: ${froms.length} top-level FROMs`)
  if (groups.length !== 1) return fail(`unparsed: ${groups.length} top-level GROUP BYs`)
  for (const kw of [/having/, /order\s+by/, /limit/, /union/, /intersect/, /except/, /window/, /offset/]) {
    if (topLevel(masked, depth, kw).length > 0) return fail(`unparsed: top-level ${kw.source}`)
  }
  const selectAt = selects[0]!
  const fromAt = froms[0]!
  const groupAt = groups[0]!
  if (masked.slice(0, selectAt).trim() !== "") return fail("unparsed: text before SELECT")
  if (!(selectAt < fromAt && fromAt < groupAt)) return fail("unparsed: SELECT, FROM and GROUP BY out of order")
  if (/^\s*distinct\b/i.test(masked.slice(selectAt + 6, fromAt))) return fail("unparsed: SELECT DISTINCT")

  const columns: SelectColumn[] = []
  const items = splitTopLevel(sqlText, masked, depth, selectAt + "select".length, fromAt)
  for (const [i, item] of items.entries()) {
    const m = ALIASED_RE.exec(item)
    if (!m) return fail(`unparsed: select column ${i + 1} has no "AS alias": ${item.slice(0, 60)}`)
    const expression = m[1]!.trim()
    const exprMasked = blankQuoted(expression) ?? expression
    columns.push({ position: i + 1, expression, alias: m[2]!, aggregate: AGGREGATE_RE.test(exprMasked) })
  }

  const groupKeyword = /group\s+by/i.exec(masked.slice(groupAt))!
  const groupBy = splitTopLevel(sqlText, masked, depth, groupAt + groupKeyword[0].length, sqlText.length)
  const ordinals = new Set<number>()
  const named = new Set<string>()
  for (const raw of groupBy) {
    const item = raw.trim()
    if (/^\d+$/.test(item)) {
      const n = Number(item)
      if (ordinals.has(n)) problems.push(`GROUP BY ${n} repeated`)
      ordinals.add(n)
      const col = columns[n - 1]
      if (!col) problems.push(`GROUP BY ${n}: there are only ${columns.length} select columns`)
      else if (col.aggregate) problems.push(`GROUP BY ${n} is an aggregate (${col.alias}): Postgres 42803`)
      continue
    }
    if (NAMED_GROUP_RE.test(item)) {
      if (AGGREGATE_RE.test(item)) problems.push(`GROUP BY ${item} is an aggregate`)
      named.add(item.toLowerCase())
      continue
    }
    return fail(`unparsed: GROUP BY item "${item.slice(0, 60)}" is neither an ordinal nor alias.column`)
  }

  for (const col of columns) {
    if (col.aggregate || ordinals.has(col.position)) continue
    const refs = [...(blankQuoted(col.expression) ?? col.expression).matchAll(COLUMN_REF_RE)].map((r) => r[0].toLowerCase())
    if (refs.length === 0) continue // a constant
    const ungrouped = refs.filter((r) => !named.has(r))
    if (ungrouped.length > 0 || named.size === 0) {
      problems.push(`select column ${col.position} (${col.alias}) is not grouped: ${ungrouped.join(", ") || "no named group"}`)
    }
  }
  return { columns, groupBy, problems }
}
