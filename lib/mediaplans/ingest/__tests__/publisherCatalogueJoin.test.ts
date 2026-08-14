/**
 * Explicit publisher_profiles → publishers.id join.
 * Never fuzzy on catalogue display name (SCA/SEN would miss).
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  EXPLICIT_PROFILE_CATALOGUE_JOIN,
  profileNameForCatalogueId,
  resolveCatalogueIdForProfileName,
} from "../publisherCatalogueJoin"

test("four-row backfill is explicit ids, not name-match", () => {
  assert.deepEqual(
    [...EXPLICIT_PROFILE_CATALOGUE_JOIN.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    ),
    [
      ["JCDecaux", 35],
      ["QMS", 30],
      ["SCA", 12],
      ["SEN", 19],
    ],
  )
  assert.equal(resolveCatalogueIdForProfileName("QMS"), 30)
  assert.equal(resolveCatalogueIdForProfileName("JCDecaux"), 35)
  assert.equal(resolveCatalogueIdForProfileName("SCA"), 12)
  assert.equal(resolveCatalogueIdForProfileName("SEN"), 19)
  assert.equal(resolveCatalogueIdForProfileName("Southern Cross Austereo"), null)
  assert.equal(resolveCatalogueIdForProfileName("Sports Entertainment Network"), null)
  assert.equal(resolveCatalogueIdForProfileName("oOh! media"), null)
})

test("catalogue id reverse-maps to the short profile name", () => {
  assert.equal(profileNameForCatalogueId(30), "QMS")
  assert.equal(profileNameForCatalogueId(35), "JCDecaux")
  assert.equal(profileNameForCatalogueId(12), "SCA")
  assert.equal(profileNameForCatalogueId(19), "SEN")
  assert.equal(profileNameForCatalogueId(43), null)
})
