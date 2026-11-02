/**
 * C-164 (B5a): on the create page a refused save keeps the page dirty and on
 * create. The version save returns "failed" for every refusal it handles
 * itself, and handleSaveAll stops before any success step. The master is
 * already saved (mediaPlanIdRef), so the next Save reuses it.
 *
 * The page is a 9,000-line client component with no render harness, so these
 * pins read its syntax tree (not regexes over the text).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import ts from "typescript"

const FILE = join(process.cwd(), "app/mediaplans/create/page.tsx")
const src = readFileSync(FILE, "utf8")
const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function findConstFn(name: string): ts.ArrowFunction {
  let found: ts.ArrowFunction | undefined
  const visit = (n: ts.Node) => {
    if (!found && ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer && ts.isArrowFunction(n.initializer)) {
      found = n.initializer
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  assert.ok(found, `missing const ${name}`)
  return found
}

/** Return statements that belong to `fn` itself (not to callbacks inside it). */
function ownReturns(fn: ts.FunctionLikeDeclaration): ts.ReturnStatement[] {
  const out: ts.ReturnStatement[] = []
  const walk = (n: ts.Node) => {
    if (n !== fn && ts.isFunctionLike(n)) return
    if (ts.isReturnStatement(n)) out.push(n)
    ts.forEachChild(n, walk)
  }
  walk(fn)
  return out
}

/** The innermost enclosing block (if/try body) text for a node. */
function enclosingBlockText(n: ts.Node): string {
  let p: ts.Node | undefined = n.parent
  while (p && !ts.isBlock(p)) p = p.parent
  return p ? p.getText(sf) : ""
}

const versionSave = findConstFn("handleSaveMediaPlanVersion")
const saveAll = findConstFn("handleSaveAll")
const saveMaster = findConstFn("handleSaveMediaPlan")

test("C-164: the version save is typed ok | failed and every own return says which", () => {
  assert.equal(versionSave.type?.getText(sf).replace(/\s+/g, ""), 'Promise<"ok"|"failed">')
  const returns = ownReturns(versionSave)
  const values = returns.map((r) => r.expression?.getText(sf))
  assert.ok(values.every((v) => v === '"ok"' || v === '"failed"'), `bare or other return: ${values.join(", ")}`)
  assert.equal(values.filter((v) => v === '"ok"').length, 1, "one success return")
})

test("C-164: each refusal the version save handles returns failed (and never clears or navigates)", () => {
  const failed = ownReturns(versionSave).filter((r) => r.expression?.getText(sf) === '"failed"')
  const kinds: Array<[string, RegExp]> = [
    ["publish with 0 line items (BOSS006)", /Publish rejected — no line items/],
    ["stale base (someone published)", /STALE_BASE_VERSION/],
    ["missing buy type", /MISSING_BUY_TYPE/],
    ["missing burst dates", /MISSING_BURST_DATES/],
    ["any other save error", /title: "Save failed"/],
  ]
  for (const [kind, marker] of kinds) {
    const hit = failed.filter((r) => marker.test(enclosingBlockText(r.parent) + enclosingBlockText(r)))
    assert.equal(hit.length >= 1, true, `${kind}: returns "failed"`)
    for (const r of hit) {
      const block = enclosingBlockText(r)
      assert.doesNotMatch(block, /clearDirtyOnSaveSuccess\(\)|router\.push|form\.reset/, `${kind}: no success step`)
    }
  }
  assert.equal(failed.length, kinds.length, "one failed return per refusal kind")
  // The missing buy type / burst date highlights are set on failure and only
  // cleared when the next save starts, so they stay visible on the page.
  const body = versionSave.getText(sf)
  assert.match(body, /setMissingBuyTypeLineIds\(ids\)/)
  assert.match(body, /setMissingBurstDateLineIds\(ids\)/)
  assert.equal((src.match(/setMissingBuyTypeLineIds\(\[\]\)/g) ?? []).length, 1, "cleared only at save start")
})

test("C-164: handleSaveAll stops on a failed version save before every success step", () => {
  const body = saveAll.getText(sf)
  const call = body.indexOf("const versionResult = await handleSaveMediaPlanVersion(")
  const stop = body.indexOf('if (versionResult !== "ok") return', call)
  assert.ok(call >= 0 && stop > call, "the result is checked right after the version save")
  for (const step of [
    "clearDirtyOnSaveSuccess()",
    "form.reset(",
    "runSaveSuccessSideEffects(",
    "describePublishSuccessToast(",
    "zipPublishedCreateDocuments(",
    "router.push(",
  ]) {
    const at = body.indexOf(step, call)
    assert.ok(at > stop, `${step} runs only after the ok check`)
  }
  // Exactly one version save call, so every Save path (Save, publish, Save and
  // download all, exitAfter, the AA warning re-run) goes through this check.
  assert.equal((src.match(/handleSaveMediaPlanVersion\(/g) ?? []).length, 1)
})

test("C-164: after a failed save the next Save reuses the saved master (no second create)", () => {
  const body = saveMaster.getText(sf)
  const reuse = body.indexOf("const existingId = mediaPlanIdRef.current")
  const early = body.indexOf("return existingId", reuse)
  const post = body.search(/fetch\(|createMediaPlan\(/)
  assert.ok(reuse >= 0 && early > reuse, "existingId short-circuit")
  assert.ok(post > early, "the master create runs only when no master is held")
  assert.match(body, /mediaPlanIdRef\.current = mediaPlan\.id/)
  // A failed version save does not reset the held master id.
  assert.doesNotMatch(saveAll.getText(sf) + versionSave.getText(sf), /mediaPlanIdRef\.current = null/)
})
