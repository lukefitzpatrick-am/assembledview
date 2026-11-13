/**
 * The static task-reader scan for C-211 (B42fix, review F3). Not a test
 * file: `taskVisibility.test.ts` runs it over the source and over probe
 * readers that must fail.
 *
 * It parses each file with the TypeScript compiler and finds every read of
 * the task tables, statement by statement:
 * - Drizzle: `.from(t)`, `.innerJoin(t, …)`, `.leftJoin`, `.rightJoin`,
 *   `.fullJoin`, `.crossJoin`, `.join`, and `db.query.<table>`, where `t`
 *   is a schema table (imported from `@/db/schema` under any local name,
 *   destructured from `schema`, or `schema.<table>`);
 * - raw SQL: any string or template literal with `FROM` or `JOIN` then a
 *   task table, in any case, across new lines, with or without `public.` or
 *   quotes (a `${schema.tasks}` in a template counts as the table).
 *
 * Each read is keyed `file#function` (the nearest named function, else
 * `<module>`) and carries its statement's text, so the test can check the
 * rule per read.
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
const RAW_READ = new RegExp(
  String.raw`\b(?:from|join)\s+(?:only\s+)?(?:"?public"?\s*\.\s*)?"?(${Object.keys(TASK_TABLES).join("|")})"?(?![\w$])`,
  "gi"
)

const SQL_WORD = /\b(select|delete|update|insert|with|exists)\b/i

export type TaskRead = {
  file: string
  fn: string
  key: string
  table: string
  kind: "drizzle" | "sql"
  line: number
  /** The text of the statement the read is in. */
  statement: string
  /** The text of the whole named function (or the module). */
  fnText: string
  /** The function's local declarations: name and initializer text. */
  decls: ReadonlyArray<{ name: string; init: string }>
}

function isSchemaModule(spec: string): boolean {
  return /(^|\/)db\/schema(\/|$)|^@\/db\/schema/.test(spec)
}

/** Local names bound to task tables in this file (imports and `const { … } = schema`). */
function tableBindings(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && isSchemaModule(node.moduleSpecifier.text)) {
      const named = node.importClause?.namedBindings
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          const imported = (el.propertyName ?? el.name).text
          const table = DRIZZLE_TO_SQL.get(imported)
          if (table) out.set(el.name.text, table)
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === "schema") {
      for (const el of node.name.elements) {
        const imported = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : ""
        const table = DRIZZLE_TO_SQL.get(imported)
        if (table && ts.isIdentifier(el.name)) out.set(el.name.text, table)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** The task table an expression names, or null. */
function tableOf(expr: ts.Expression, bindings: Map<string, string>): string | null {
  if (ts.isIdentifier(expr)) return bindings.get(expr.text) ?? null
  if (ts.isPropertyAccessExpression(expr)) {
    const name = expr.name.text
    const table = DRIZZLE_TO_SQL.get(name)
    if (!table) return null
    const base = expr.expression
    if (ts.isIdentifier(base) && base.text === "schema") return table
    if (ts.isPropertyAccessExpression(base) && base.name.text === "query") return table
    return null
  }
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) return tableOf(expr.expression, bindings)
  return null
}

function functionName(node: ts.Node): string | null {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) return node.name.getText()
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent) {
    const p = node.parent
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text
    if (ts.isPropertyAssignment(p)) return p.name.getText()
  }
  return null
}

function declsOf(fn: ts.Node, sf: ts.SourceFile): Array<{ name: string; init: string }> {
  const out: Array<{ name: string; init: string }> = []
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) out.push({ name: n.name.text, init: n.initializer.getText(sf) })
    ts.forEachChild(n, visit)
  }
  visit(fn)
  return out
}

function enclosing(node: ts.Node, sf: ts.SourceFile): { fn: string; fnText: string; statement: string; decls: Array<{ name: string; init: string }> } {
  let statement: ts.Node | null = null
  const guards: string[] = []
  let cur: ts.Node | undefined = node
  let child: ts.Node = node
  while (cur && cur !== sf) {
    if (!statement && (ts.isVariableStatement(cur) || ts.isExpressionStatement(cur) || ts.isReturnStatement(cur) || ts.isIfStatement(cur) || ts.isForOfStatement(cur))) {
      statement = cur
    }
    // The read runs only when the conditions of the ifs around it allow: they count as its statement.
    if (ts.isIfStatement(cur) && child !== cur.expression) guards.push(cur.expression.getText(sf))
    const name = functionName(cur)
    const text = () => [(statement ?? node).getText(sf), ...guards].join("\n/* guard */ ")
    if (name) return { fn: name, fnText: cur.getText(sf), statement: text(), decls: declsOf(cur, sf) }
    child = cur
    cur = cur.parent
  }
  return { fn: "<module>", fnText: sf.getText(), statement: [(statement ?? node).getText(sf), ...guards].join("\n/* guard */ "), decls: declsOf(sf, sf) }
}

function literalText(node: ts.Node, bindings: Map<string, string>, sf: ts.SourceFile): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text
    for (const span of node.templateSpans) {
      out += ` ${tableOf(span.expression, bindings) ?? "$x"} ` + span.literal.text
    }
    return out
  }
  void sf
  return null
}

/** Every read of a task table in one source file. `file` is the repo-relative path. */
export function findTaskReads(file: string, text: string): TaskRead[] {
  const kind = /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : /\.(m|c)?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const bindings = tableBindings(sf)
  const reads: TaskRead[] = []
  const add = (node: ts.Node, table: string, k: TaskRead["kind"]) => {
    const where = enclosing(node, sf)
    reads.push({
      file,
      fn: where.fn,
      key: `${file}#${where.fn}`,
      table,
      kind: k,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      statement: where.statement,
      fnText: where.fnText,
      decls: where.decls,
    })
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && READ_METHODS.has(node.expression.name.text) && node.arguments.length > 0) {
      const table = tableOf(node.arguments[0], bindings)
      if (table) add(node, table, "drizzle")
    }
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "query") {
      const table = DRIZZLE_TO_SQL.get(node.name.text)
      if (table) add(node, table, "drizzle")
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const lit = literalText(node, bindings, sf)
      // A tagged sql`` template is SQL; any other literal only when it reads like SQL (prose such as "move it from Tasks" is not).
      const tagged = node.parent != null && ts.isTaggedTemplateExpression(node.parent)
      if (lit && (tagged || SQL_WORD.test(lit))) {
        for (const m of lit.matchAll(RAW_READ)) add(node, m[1].toLowerCase(), "sql")
      }
      if (ts.isTemplateExpression(node)) {
        // Spans can hold nested sql`` fragments: visit them too.
        for (const span of node.templateSpans) visit(span.expression)
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return reads
}

export type ReaderRule =
  /** Every read statement applies the shared SQL rule (directly or through a local it declares). */
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
export const SHARED_RULE = /\b(taskVisibilityCondition|taskVisibleSql|visibleToRecipient|hiddenTaskIds|isTaskHiddenFrom)\b/
/** Names that check one project or task in TS. */
export const PROJECT_RULE = /\b(loadVisibleProject|canSeeProject|canSeeTask|loadVisibleTask|lockParent|loadVisibleTaskForAttachments)\b/

/** `name` used as an identifier in `text` (not as a property, such as `.where(`). */
function uses(text: string, name: string): boolean {
  return new RegExp(String.raw`(?<![.\w$])${name.replace(/\$/g, "\\$")}(?![\w$])`).test(text)
}

/** Locals whose initializer applies the shared rule (or a `via` name), then locals built from those. */
function ruleLocals(decls: ReadonlyArray<{ name: string; init: string }>, via: readonly string[]): string[] {
  const out: string[] = [...via]
  for (let pass = 0; pass < 3; pass++) {
    for (const d of decls) {
      if (out.includes(d.name)) continue
      if (SHARED_RULE.test(d.init) || out.some((n) => uses(d.init, n))) out.push(d.name)
    }
  }
  return out
}

/** The text of the function `name` declared in `source` (declaration or const arrow), or null. */
function functionText(source: string, file: string, name: string): string | null {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let found: string | null = null
  const visit = (node: ts.Node) => {
    if (found) return
    if (functionName(node) === name) found = node.getText(sf)
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
        const helper = functionText(sourceOf(rs[0].file), rs[0].file, name)
        if (helper != null) {
          if (!SHARED_RULE.test(helper)) problems.push(`${key}: via ${name}, which does not apply the shared rule`)
        } else if (!new RegExp(String.raw`\b${name}\??\s*:`).test(rs[0].fnText.slice(0, rs[0].fnText.indexOf("{") + 1 || undefined))) {
          problems.push(`${key}: via ${name}, which is neither a function in the file nor a parameter`)
        }
      }
      const locals = ruleLocals(rs[0].decls, via)
      for (const r of rs) {
        const ok = SHARED_RULE.test(r.statement) || locals.some((n) => uses(r.statement, n))
        if (!ok) problems.push(`${key}: the ${r.table} read at line ${r.line} does not apply the shared rule`)
      }
    }
    if (entry.rule === "project" && !PROJECT_RULE.test(rs[0].fnText)) problems.push(`${key}: no project or task visibility check in the function`)
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
  const kind = /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : /\.(m|c)?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const bindings = tableBindings(sf)
  const out: TaskCreate[] = []
  const add = (node: ts.Node, k: TaskCreate["kind"]) => {
    const where = enclosing(node, sf)
    out.push({ key: `${file}#${where.fn}`, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind: k })
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === "insert" && node.arguments.length > 0 && tableOf(node.arguments[0], bindings) === "tasks") add(node, "insert")
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ""
      if (name === "createTask") add(node, "createTask")
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const lit = literalText(node, bindings, sf)
      if (lit && RAW_TASK_INSERT.test(lit)) add(node, "insert")
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}
