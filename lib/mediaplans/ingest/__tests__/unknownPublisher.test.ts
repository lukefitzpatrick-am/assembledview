/**
 * Unknown publisher: never guess a catalogue row; first upload creates a
 * profile linked to the human-chosen publishers.id.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  UNKNOWN_PUBLISHER_CONFIDENCE,
  isUnknownPublisherMatch,
} from "../unknownPublisher"
import {
  clearLinkedProfileOverlayForTests,
  createLinkedPublisherProfile,
} from "../createLinkedPublisherProfile"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import {
  clearPublisherProfileSeedOverlayForTests,
  profilesWithRemapOverlay,
} from "../persistColumnRemap"

test("confidence below threshold is unknown — never a guessed publisher", () => {
  assert.equal(UNKNOWN_PUBLISHER_CONFIDENCE, 0.5)
  assert.equal(isUnknownPublisherMatch(null), true)
  assert.equal(isUnknownPublisherMatch({ confidence: 0.12 }), true)
  assert.equal(isUnknownPublisherMatch({ confidence: 0.49 }), true)
  assert.equal(isUnknownPublisherMatch({ confidence: 0.5 }), false)
  assert.equal(isUnknownPublisherMatch({ confidence: 0.94 }), false)
})

test("linking an existing four-row catalogue id reuses the short profile name", async () => {
  clearLinkedProfileOverlayForTests()
  const sca = await createLinkedPublisherProfile({
    catalogue: {
      id: 12,
      publisher_name: "Southern Cross Austereo",
      publisherid: "sca",
      pub_radio: true,
      pub_ooh: false,
    },
  })
  assert.equal(sca.publisher_name, "SCA")
  assert.equal(sca.publisher_id, 12)
  assert.equal(sca.media_type, "radio")
})

test("unknown catalogue publisher creates a linked empty profile — name from catalogue, never the file", async () => {
  clearLinkedProfileOverlayForTests()
  const created = await createLinkedPublisherProfile({
    catalogue: {
      id: 99,
      publisher_name: "Nova Entertainment",
      publisherid: "nova",
      pub_radio: true,
      pub_ooh: false,
    },
    guessedFilePublisherName: "some-xlsx-stem",
  })
  assert.equal(created.publisher_name, "Nova Entertainment")
  assert.notEqual(created.publisher_name, "some-xlsx-stem")
  assert.equal(created.publisher_id, 99)
  assert.equal(created.media_type, "radio")
  assert.deepEqual(created.column_map, {})
  assert.deepEqual(created.detect_signature, {})
  const again = await createLinkedPublisherProfile({
    catalogue: {
      id: 99,
      publisher_name: "Nova Entertainment",
      publisherid: "nova",
      pub_radio: true,
      pub_ooh: false,
    },
  })
  assert.equal(again.publisher_name, "Nova Entertainment")
  assert.equal(again.publisher_id, 99)
})

test("seed profiles stay addressable by short name after overlay", () => {
  clearPublisherProfileSeedOverlayForTests()
  const names = profilesWithRemapOverlay(loadSeedPublisherProfiles()).map(
    (p) => p.publisher_name,
  )
  assert.deepEqual(names.sort(), ["JCDecaux", "QMS", "SCA", "SEN"])
})
