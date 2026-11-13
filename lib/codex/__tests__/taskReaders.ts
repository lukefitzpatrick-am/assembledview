/**
 * The static task-reader scan for C-211 (B42fix, review F3; widened in
 * PACK3fix, review P2). Not a test file: `taskVisibility.test.ts` runs it over
 * the source and over probe readers that must fail.
 *
 * It parses each file with the TypeScript compiler and finds every read of
 * the task tables, read by read:
 * - Drizzle: `.from(t)`, `.innerJoin(t, …)`, `.leftJoin`, `.rightJoin`,
 *   `.fullJoin`, `.crossJoin`, `.join`, and `db.query.<table>`, where `t`
 *   is a schema table: imported under any local name from any module (a
 *   re-export counts), a member of a namespace (`schema.tasks`,
 *   `s["tasks"]`, `import * as s`, `x.schema.tasks`), a local bound to one
 *   (`const t = schema.tasks`, `const { tasks: t } = schema`, `alias(tasks)`);
 * - a table passed to any other call (a helper that wraps `.from(t)`), except
 *   writes (`insert`, `update`, `delete`) and table metadata;
 * - raw SQL: a string, template or `+` concatenation with `FROM` or `JOIN`
 *   then a task table or a view or function over one (`taskRelations`), in
 *   any case, across new lines, with or without `public.` or quotes. A
 *   template's `${…}` counts as its table, its `sql.raw`/`sql.identifier`
 *   text or a const string of the file. A text is SQL when it is a tagged
 *   template, an argument of `sql.raw`/`sql.join`/`sql.identifier`, reads like
 *   SQL, or starts with `FROM`/`JOIN`;
 * - supabase-js style: `.from("tasks")`, and `.rpc("<function over tasks>")`.
 *
 * Each read is keyed `file#function` (the nearest named function, else
 * `<module>`) and carries the identifiers of its own expression (the call
 * chain, or the SQL template and the `sql.*` calls around it): not the
 * statement around it, not an `if` guard, not a comment. The shared rule is
 * checked against those.
 */
import ts from "typescript"

/** SQL name to Drizzle name, for every table that holds or points at task data. */
export const TASK_TABLES: Readonly<Record<string, string>> = {
  tasks: "tasks",
  task_comments: "taskComments",
  task_attachments: "taskAttachments",
  task_followers: "taskFollowers",
  task_checklist_items: "taskChecklistItems",
  codex_activity: "codexActivity",
  codex_notifications: "codexNotifications",
}

const DRIZZLE_TO_SQL = new Map(Object.entries(TASK_TABLES).map(([sqlName, drizzle]) => [drizzle, sqlName]))
const READ_METHODS = new Set(["from", "innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin", "join"])
/** Calls that take a table and read no rows: writes and table metadata. */
const NON_READ_TABLE_CALLS = new Set(["insert", "update", "delete", "alias", "getTableColumns", "getTableName", "getTableConfig", "is"])
/** `sql.<fn>` calls whose string arguments are SQL. */
const SQL_FN_ARGS = new Set(["raw", "join", "identifier", "append"])

const SQL_WORD = /\b(select|delete|update|insert|with|exists)\b/i
const LEADING_FROM = /^\s*(from|join)\b/i

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
function rawReadPattern(relations: readonly string[]): RegExp {
  const names = [...Object.keys(TASK_TABLES), ...relations].map(escapeRe)
  return new RegExp(String.raw`\b(?:from|join)\s+(?:only\s+)?(?:"?public"?\s*\.\s*)?"?(${names.join("|")})"?(?![\w$])`, "gi")
}
/** `"public"."tasks"` → `tasks`. */
function bareName(name: string): string {
  return name.replace(/"/g, "").split(".").pop()!.trim().toLowerCase()
}

export type TaskRead = {
  file: string
  fn: string
  key: string
  table: string
  kind: "drizzle" | "sql"
  line: number
  /** The text of the read's own expression. */
  statement: string
  /** Identifiers in the read's own expression (no property names, comments or strings). */
  scopeIds: readonly string[]
  /** The text of the whole named function (or the module). */
  fnText: string
  /** Every identifier and property name in the function (no comments or strings). */
  fnIds: readonly string[]
  /** The function's local declarations: name and the identifiers of its initializer. */
  decls: ReadonlyArray<{ name: string; ids: readonly string[] }>
}

// ---------------------------------------------------------------------------
// Views and functions over task tables (from the SQL migrations)
// ---------------------------------------------------------------------------

/**
 * Names of views and set-returning (non-trigger) functions whose body reads a
 * task table, or another such view or function, in `sqlTexts`. A read of one
 * of these is a read of task data.
 */
export function taskRelations(sqlTexts: readonly string[]): string[] {
  const defs: Array<{ name: string; body: string; returns: string }> = []
  for (const text of sqlTexts) {
    const views = /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?((?:"?\w+"?\s*\.\s*)?"?\w+"?)[\s\S]*?\bas\b([\s\S]*?)(?:;|$)/gi
    for (const m of text.matchAll(views)) defs.push({ name: bareName(m[1]), body: m[2], returns: "view" })
    const fns = /create\s+(?:or\s+replace\s+)?function\s+((?:"?\w+"?\s*\.\s*)?"?\w+"?)\s*\([\s\S]*?\breturns\s+((?:setof\s+|table\s*\()?[\w."]+)[\s\S]*?\$(\w*)\$([\s\S]*?)\$\3\$/gi
    for (const m of text.matchAll(fns)) defs.push({ name: bareName(m[1]), body: m[4], returns: m[2].toLowerCase() })
  }
  const found = new Set<string>()
  for (let pass = 0; pass < 5; pass++) {
    const pattern = rawReadPattern([...found])
    for (const d of defs) {
      if (found.has(d.name) || /^(trigger|void|event_trigger)$/.test(d.returns)) continue
      pattern.lastIndex = 0
      const setofTask = /^setof\s+/.test(d.returns) && Object.keys(TASK_TABLES).includes(bareName(d.returns.replace(/^setof\s+/, "")))
      if (setofTask || pattern.test(d.body)) found.add(d.name)
    }
  }
  return [...found].sort()
}

// ---------------------------------------------------------------------------
// Bindings: local names for tables, schema namespaces and const strings
// ---------------------------------------------------------------------------

type Bindings = { tables: Map<string, string>; namespaces: Set<string>; strings: Map<string, string> }

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression
  return e
}

/** `a.b` or `a["b"]`: the member name. */
function memberName(expr: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  if (ts.isElementAccessExpression(expr) && ts.isStringLiteralLike(expr.argumentExpression)) return expr.argumentExpression.text
  return null
}

function isNamespaceExpr(expr: ts.Expression, b: Bindings): boolean {
  const e = unwrap(expr)
  if (ts.isIdentifier(e)) return e.text === "schema" || b.namespaces.has(e.text)
  return memberName(e) === "schema"
}

/** The task table an expression names, or null. */
function tableOf(expr: ts.Expression, b: Bindings): string | null {
  const e = unwrap(expr)
  if (ts.isIdentifier(e)) return b.tables.get(e.text) ?? null
  const name = memberName(e)
  if (name != null) {
    const table = DRIZZLE_TO_SQL.get(name)
    if (!table) return null
    const base = (e as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression
    if (isNamespaceExpr(base, b)) return table
    if (memberName(unwrap(base)) === "query") return table
    return null
  }
  // alias(tasks, "parent") is the same table under another name.
  if (ts.isCallExpression(e) && calleeName(e) === "alias" && e.arguments.length > 0) return tableOf(e.arguments[0], b)
  return null
}

function calleeName(call: ts.CallExpression): string {
  const c = call.expression
  return ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : ""
}

/** `sql.raw(…)`, `sql.join(…)`, …: a call on the identifier `sql`. */
function isSqlFnCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    SQL_FN_ARGS.has(node.expression.name.text) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "sql"
  )
}

/** The text of a string-like expression (literal, template, `+` chain, const), or null. */
function textOf(expr: ts.Expression, b: Bindings): string | null {
  const e = unwrap(expr)
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text
  if (ts.isTemplateExpression(e)) {
    let out = e.head.text
    for (const span of e.templateSpans) out += spanText(span.expression, b) + span.literal.text
    return out
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = textOf(e.left, b)
    const r = textOf(e.right, b)
    if (l == null && r == null) return null
    return (l ?? " $x ") + (r ?? " $x ")
  }
  if (ts.isIdentifier(e)) return b.strings.get(e.text) ?? null
  return null
}

function spanText(expr: ts.Expression, b: Bindings): string {
  const table = tableOf(expr, b)
  if (table) return ` ${table} `
  const e = unwrap(expr)
  if (ts.isCallExpression(e) && (calleeName(e) === "raw" || calleeName(e) === "identifier") && e.arguments.length > 0) {
    const t = textOf(e.arguments[0], b)
    if (t != null) return ` ${t} `
  }
  return ` ${textOf(e, b) ?? "$x"} `
}

function collectBindings(sf: ts.SourceFile): Bindings {
  const b: Bindings = { tables: new Map(), namespaces: new Set(), strings: new Map() }
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings) continue
    const named = st.importClause.namedBindings
    // Any module: a table re-exported elsewhere is still the table.
    if (ts.isNamespaceImport(named)) b.namespaces.add(named.name.text)
    else {
      for (const el of named.elements) {
        const imported = (el.propertyName ?? el.name).text
        const table = DRIZZLE_TO_SQL.get(imported)
        if (table) b.tables.set(el.name.text, table)
        if (imported === "schema") b.namespaces.add(el.name.text)
      }
    }
  }
  const decls: ts.VariableDeclaration[] = []
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) decls.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  for (let pass = 0; pass < 3; pass++) {
    for (const d of decls) {
      const init = d.initializer!
      if (ts.isIdentifier(d.name)) {
        const table = tableOf(init, b)
        if (table) b.tables.set(d.name.text, table)
        else if (isNamespaceExpr(init, b)) b.namespaces.add(d.name.text)
        else {
          const text = textOf(init, b)
          if (text != null) b.strings.set(d.name.text, text)
        }
      } else if (ts.isObjectBindingPattern(d.name) && isNamespaceExpr(init, b)) {
        for (const el of d.name.elements) {
          const imported = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : ""
          const table = DRIZZLE_TO_SQL.get(imported)
          if (table && ts.isIdentifier(el.name)) b.tables.set(el.name.text, table)
        }
      }
    }
  }
  return b
}

// ---------------------------------------------------------------------------
// Where a read is
// ---------------------------------------------------------------------------

function functionName(node: ts.Node): string | null {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) return node.name.getText()
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent) {
    const p = node.parent
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text
    if (ts.isPropertyAssignment(p)) return p.name.getText()
  }
  return null
}

/** Identifiers under `node` (comments and strings are not nodes). Property names only when `withProps`. */
function idsIn(node: ts.Node, withProps: boolean): string[] {
  const out = new Set<string>()
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent
      const isProp = p != null && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n))
      if (withProps || !isProp) out.add(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return [...out]
}

function declsOf(fn: ts.Node): Array<{ name: string; ids: string[] }> {
  const out: Array<{ name: string; ids: string[] }> = []
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) out.push({ name: n.name.text, ids: idsIn(n.initializer, false) })
    ts.forEachChild(n, visit)
  }
  visit(fn)
  return out
}

/**
 * The read's own expression: up its call chain (`.from(t).where(…)`, `await`),
 * and for SQL up through the template, `+` chains, spans of outer templates
 * and `sql.*` calls. Never a sibling argument, the statement or a guard.
 */
function readScope(node: ts.Node): ts.Node {
  let cur = node
  for (;;) {
    const p = cur.parent
    if (!p) return cur
    const chain =
      (ts.isPropertyAccessExpression(p) && p.expression === cur) ||
      (ts.isElementAccessExpression(p) && p.expression === cur) ||
      (ts.isCallExpression(p) && p.expression === cur) ||
      ts.isAwaitExpression(p) ||
      ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p)
    const sqlUp =
      (ts.isTaggedTemplateExpression(p) && p.template === cur) ||
      ts.isTemplateSpan(p) ||
      (ts.isTemplateExpression(p) && p.head !== cur) ||
      (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
      (isSqlFnCall(p) && p.expression !== cur) ||
      (ts.isArrayLiteralExpression(p) && p.parent != null && isSqlFnCall(p.parent))
    if (!chain && !sqlUp) return cur
    cur = p
  }
}

function enclosing(node: ts.Node, sf: ts.SourceFile) {
  let cur: ts.Node | undefined = node
  while (cur && cur !== sf) {
    const name = functionName(cur)
    if (name) return { fn: name, fnNode: cur }
    cur = cur.parent
  }
  return { fn: "<module>", fnNode: sf as ts.Node }
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

function sourceFile(file: string, text: string): ts.SourceFile {
  const kind = /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : /\.(m|c)?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
}

/** Every read of a task table in one source file. `file` is the repo-relative path; `relations` from `taskRelations`. */
export function findTaskReads(file: string, text: string, relations: readonly string[] = []): TaskRead[] {
  const sf = sourceFile(file, text)
  const b = collectBindings(sf)
  const rawRead = rawReadPattern(relations)
  const named = new Set([...Object.keys(TASK_TABLES), ...relations])
  const reads: TaskRead[] = []
  const fnCache = new Map<ts.Node, { fnText: string; fnIds: string[]; decls: Array<{ name: string; ids: string[] }> }>()
  const add = (node: ts.Node, table: string, k: TaskRead["kind"]) => {
    const where = enclosing(node, sf)
    let facts = fnCache.get(where.fnNode)
    if (!facts) {
      facts = { fnText: where.fnNode.getText(sf), fnIds: idsIn(where.fnNode, true), decls: declsOf(where.fnNode) }
      fnCache.set(where.fnNode, facts)
    }
    const scope = readScope(node)
    reads.push({
      file,
      fn: where.fn,
      key: `${file}#${where.fn}`,
      table,
      kind: k,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      statement: scope.getText(sf),
      scopeIds: idsIn(scope, false),
      ...facts,
    })
  }
  const isStringish = (n: ts.Node): n is ts.Expression =>
    ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n) || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken)
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node)
      if (READ_METHODS.has(name) && ts.isPropertyAccessExpression(node.expression) && node.arguments.length > 0) {
        const table = tableOf(node.arguments[0], b)
        if (table) add(node, table, "drizzle")
        // supabase-js style: .from("tasks")
        if (name === "from" && ts.isStringLiteralLike(node.arguments[0]) && named.has(bareName(node.arguments[0].text))) add(node, bareName(node.arguments[0].text), "sql")
      } else if (name === "rpc" && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0]) && relations.includes(bareName(node.arguments[0].text))) {
        add(node, bareName(node.arguments[0].text), "sql")
      } else if (!NON_READ_TABLE_CALLS.has(name)) {
        // A table handed to any other call (a helper that wraps .from(t)) is read there.
        for (const arg of node.arguments) {
          const table = tableOf(arg, b)
          if (table) add(node, table, "drizzle")
        }
      }
    }
    if (ts.isPropertyAccessExpression(node) && memberName(unwrap(node.expression)) === "query") {
      const table = DRIZZLE_TO_SQL.get(node.name.text)
      if (table) add(node, table, "drizzle")
    }
    if (ts.isElementAccessExpression(node) && memberName(unwrap(node.expression)) === "query") {
      const table = DRIZZLE_TO_SQL.get(memberName(node) ?? "")
      if (table) add(node, table, "drizzle")
    }
    const partOfChain = node.parent != null && ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
    if (isStringish(node) && !partOfChain) {
      const lit = textOf(node, b)
      if (lit != null) {
        // A tagged sql`` template, an argument of sql.raw / sql.join, text that reads like SQL, or a FROM/JOIN piece.
        const parent = node.parent
        const inSqlCall = parent != null && ((isSqlFnCall(parent) && parent.expression !== node) || (ts.isArrayLiteralExpression(parent) && parent.parent != null && isSqlFnCall(parent.parent)))
        const tagged = parent != null && ts.isTaggedTemplateExpression(parent)
        if (tagged || inSqlCall || SQL_WORD.test(lit) || LEADING_FROM.test(lit)) {
          rawRead.lastIndex = 0
          for (const m of lit.matchAll(rawRead)) add(node, m[1].toLowerCase(), "sql")
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return reads
}

export type ReaderRule =
  /** Every read applies the shared SQL rule in its own expression (directly or through a local or `via` name). */
  | "shared"
  /** Reads inside one project or task after a TS visibility check in the same function. */
  | "project"
  /** Not a read for a person, or given visible ids by its caller: the reason says which. */
  | "exempt"

export type ReaderEntry = {
  rule: ReaderRule
  reason: string
  /**
   * "shared" only: names that carry the rule into this function. A function
   * of that name in the same file must itself apply the shared rule; any
   * other name must be a parameter of the reader (its callers pass the rule,
   * as the reason says).
   */
  via?: readonly string[]
}

/** Names that apply the shared SQL rule. */
export const SHARED_RULE_NAMES: ReadonlySet<string> = new Set(["taskVisibilityCondition", "taskVisibleSql", "visibleToRecipient", "hiddenTaskIds", "isTaskHiddenFrom"])
/** Names that check one project or task in TS. */
export const PROJECT_RULE_NAMES: ReadonlySet<string> = new Set(["loadVisibleProject", "canSeeProject", "canSeeTask", "loadVisibleTask", "lockParent", "loadVisibleTaskForAttachments"])

const appliesShared = (ids: readonly string[]) => ids.some((id) => SHARED_RULE_NAMES.has(id))

/** Locals whose initializer applies the shared rule (or a `via` name), then locals built from those. */
function ruleLocals(decls: ReadonlyArray<{ name: string; ids: readonly string[] }>, via: readonly string[]): string[] {
  const out: string[] = [...via]
  for (let pass = 0; pass < 3; pass++) {
    for (const d of decls) {
      if (out.includes(d.name)) continue
      if (appliesShared(d.ids) || out.some((n) => d.ids.includes(n))) out.push(d.name)
    }
  }
  return out
}

/** The identifiers of the function `name` declared in `source` (declaration or const arrow), or null. */
function functionIds(source: string, file: string, name: string): string[] | null {
  const sf = sourceFile(file, source)
  let found: string[] | null = null
  const visit = (node: ts.Node) => {
    if (found) return
    if (functionName(node) === name) found = idsIn(node, false)
    else ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/** Problems: unclassified readers, stale entries, and reads that do not apply the rule they are listed under. */
export function checkReaders(
  reads: readonly TaskRead[],
  table: Readonly<Record<string, ReaderEntry>>,
  sourceOf: (file: string) => string = () => ""
): string[] {
  const problems: string[] = []
  const found = new Map<string, TaskRead[]>()
  for (const r of reads) found.set(r.key, [...(found.get(r.key) ?? []), r])
  for (const [key, rs] of found) {
    const entry = table[key]
    if (!entry) {
      problems.push(`unclassified reader ${key} (${[...new Set(rs.map((r) => `${r.table}:${r.line}`))].join(", ")}): apply taskVisibility (C-211) and list it`)
      continue
    }
    if (!entry.reason.trim()) problems.push(`${key}: no reason`)
    if (entry.rule === "shared") {
      const via = entry.via ?? []
      for (const name of via) {
        const helper = functionIds(sourceOf(rs[0].file), rs[0].file, name)
        if (helper != null) {
          if (!appliesShared(helper)) problems.push(`${key}: via ${name}, which does not apply the shared rule`)
        } else if (!new RegExp(String.raw`\b${name}\??\s*:`).test(rs[0].fnText.slice(0, rs[0].fnText.indexOf("{") + 1 || undefined))) {
          problems.push(`${key}: via ${name}, which is neither a function in the file nor a parameter`)
        }
      }
      const locals = ruleLocals(rs[0].decls, via)
      for (const r of rs) {
        const ok = appliesShared(r.scopeIds) || locals.some((n) => r.scopeIds.includes(n))
        if (!ok) problems.push(`${key}: the ${r.table} read at line ${r.line} does not apply the shared rule in its own expression`)
      }
    }
    if (entry.rule === "project" && !rs[0].fnIds.some((id) => PROJECT_RULE_NAMES.has(id))) problems.push(`${key}: no project or task visibility check in the function`)
  }
  for (const key of Object.keys(table)) if (!found.has(key)) problems.push(`stale entry ${key}: no read found there`)
  return problems
}

// ---------------------------------------------------------------------------
// P1 (PACK3fix): writers that create a task
// ---------------------------------------------------------------------------

export type TaskCreate = {
  key: string
  line: number
  /** `insert`: a Drizzle or raw SQL insert into `tasks`; `createTask`: a call to the shared creator. */
  kind: "insert" | "createTask"
}

const RAW_TASK_INSERT = /\binsert\s+into\s+(?:"?public"?\s*\.\s*)?"?tasks"?(?![\w$])/i

/**
 * Every place that makes a new task row: inserts into `tasks` (Drizzle
 * `.insert(t)` with a task table binding, or raw SQL) and calls to a function
 * named `createTask` (the shared creator, injected or imported). Keyed
 * `file#function` like the readers.
 */
export function findTaskCreates(file: string, text: string): TaskCreate[] {
  const sf = sourceFile(file, text)
  const bindings = collectBindings(sf)
  const out: TaskCreate[] = []
  const add = (node: ts.Node, k: TaskCreate["kind"]) => {
    const where = enclosing(node, sf)
    out.push({ key: `${file}#${where.fn}`, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind: k })
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === "insert" && node.arguments.length > 0 && tableOf(node.arguments[0], bindings) === "tasks") add(node, "insert")
      if (calleeName(node) === "createTask") add(node, "createTask")
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const lit = textOf(node, bindings)
      if (lit && RAW_TASK_INSERT.test(lit)) add(node, "insert")
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}
