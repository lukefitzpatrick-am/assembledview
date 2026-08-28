import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { canonicalise } from "../canonicalise"

describe("canonicalise — writing noise, not semantics", () => {
  it("equates wrapping parens and case on a partial predicate", () => {
    assert.equal(
      canonicalise("(published_at IS NOT NULL)"),
      canonicalise("published_at is not null"),
    )
  })

  it("strips ::bigint / ::text casts and wrapping parens on a column", () => {
    assert.equal(canonicalise("(master_id)::bigint"), "master_id")
    assert.equal(canonicalise("(kind)::text"), "kind")
    assert.equal(canonicalise("master_id"), "master_id")
  })

  it("collapses whitespace and quoting", () => {
    assert.equal(
      canonicalise('  "proposed_mba_number"   IS   NOT    NULL  '),
      "proposed_mba_number is not null",
    )
  })

  it("strips schema/table prefixes", () => {
    assert.equal(canonicalise("public.tasks.ava_auto_key"), "ava_auto_key")
    assert.equal(canonicalise("tasks.ava_auto_key"), "ava_auto_key")
  })

  it("keeps AND/OR structure after unwrapping the outer pair only", () => {
    assert.equal(
      canonicalise("(retained_at IS NULL AND expires_at IS NOT NULL)"),
      "retained_at is null and expires_at is not null",
    )
  })

  it("does not treat different predicates as equal", () => {
    assert.notEqual(
      canonicalise("published_at IS NOT NULL"),
      canonicalise("published_at IS NULL"),
    )
    assert.notEqual(
      canonicalise("active = true"),
      canonicalise("active"),
    )
  })

  it("does not drop inner parens that change AND/OR binding", () => {
    assert.notEqual(
      canonicalise("(a OR b) AND c"),
      canonicalise("a OR b AND c"),
    )
  })

  it("does not reorder conjuncts (column-order analogue for predicates)", () => {
    assert.notEqual(
      canonicalise("retained_at IS NULL AND expires_at IS NOT NULL"),
      canonicalise("expires_at IS NOT NULL AND retained_at IS NULL"),
    )
  })

  it("equates live pg_get_expr vs drizzle sql for the clients partial uniques", () => {
    assert.equal(
      canonicalise(
        "(m365_is_anchor AND (mbaidentifier IS NOT NULL) AND (btrim(mbaidentifier) <> ''::text))",
      ),
      canonicalise(
        "m365_is_anchor AND mbaidentifier IS NOT NULL AND btrim(mbaidentifier) <> ''",
      ),
    )
    assert.equal(
      canonicalise("((slug IS NOT NULL) AND (btrim(slug) <> ''::text))"),
      canonicalise("slug IS NOT NULL AND btrim(slug) <> ''"),
    )
  })

  it("strips ::bigint inside COALESCE (assignment_rules unique)", () => {
    assert.equal(
      canonicalise("COALESCE(client_id, 0::bigint)"),
      canonicalise("COALESCE(client_id, 0)"),
    )
  })
})
