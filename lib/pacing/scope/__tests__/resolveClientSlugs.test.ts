import assert from "node:assert/strict"
import test from "node:test"
import { resolveClientSlugs, slugifyPlanClientName } from "../resolveClientSlugs.js"

test("slugifyPlanClientName matches plan slug rules", () => {
  assert.equal(slugifyPlanClientName("Acme & Co"), "acme-co")
  assert.equal(slugifyPlanClientName("  Foo   Bar  "), "foo-bar")
})

test("resolveClientSlugs: null → all slugs from catalog", async () => {
  const slugs = await resolveClientSlugs(null, {
    fetchRows: async () => [
      { id: 1, client_name: "Alpha Ltd" },
      { id: 2, mp_client_name: "Beta Co" },
    ],
  })
  assert.deepEqual(slugs, ["alpha-ltd", "beta-co"])
})

test("resolveClientSlugs: [] → no fetch (empty)", async () => {
  let called = 0
  const slugs = await resolveClientSlugs([], {
    fetchRows: async () => {
      called += 1
      return [{ id: 1, client_name: "Nope" }]
    },
  })
  assert.deepEqual(slugs, [])
  assert.equal(called, 0)
})

test("resolveClientSlugs: explicit ids → matching slugs only", async () => {
  const slugs = await resolveClientSlugs([123, 456], {
    fetchRows: async () => [
      { id: 123, client_name: "Scoped One" },
      { id: 456, mp_client_name: "Scoped Two" },
      { id: 999, client_name: "Other" },
    ],
  })
  assert.deepEqual(slugs, ["scoped-one", "scoped-two"])
})
