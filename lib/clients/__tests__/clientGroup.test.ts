import assert from "node:assert/strict"
import test from "node:test"
import { clientIdsFromGroup, resolveClientGroup } from "../clientGroup"
import { GOLF_CLIENT_ROWS } from "./golfClientRows.fixture"

const rows = [
  { id: 25, mp_client_name: "Penfolds", mbaidentifier: "PENFOLD" },
  { id: 44, mp_client_name: "Penfolds - PR Campaigns", mbaidentifier: "PENFOLD" },
  { id: 90, mp_client_name: "Penfold Cellars", mbaidentifier: "PENF" }, // decoy: prefix of PENFOLD
  { id: 12, mp_client_name: "Sinch", mbaidentifier: "SINCH" }, // unrelated
]

function memberIds(group: NonNullable<ReturnType<typeof resolveClientGroup>>): number[] {
  return group.members.map((m) => Number(m.id)).sort((a, b) => a - b)
}

test('resolveClientGroup("penfold") groups by exact mbaidentifier PENFOLD', () => {
  const group = resolveClientGroup(rows, "penfold")
  assert.ok(group)
  assert.equal(group.anchor.id, 25)
  assert.deepEqual(memberIds(group), [25, 44])
  assert.deepEqual(
    [...group.nameSlugs].sort(),
    ["penfolds", "penfolds-pr-campaigns"],
  )
})

test('resolveClientGroup("penfolds") matches by name-slug, same group', () => {
  const group = resolveClientGroup(rows, "penfolds")
  assert.ok(group)
  assert.equal(group.anchor.id, 25)
  assert.deepEqual(memberIds(group), [25, 44])
  assert.deepEqual(
    [...group.nameSlugs].sort(),
    ["penfolds", "penfolds-pr-campaigns"],
  )
})

test('resolveClientGroup("penf") is exact — no prefix bleed into PENFOLD', () => {
  const group = resolveClientGroup(rows, "penf")
  assert.ok(group)
  assert.equal(group.anchor.id, 90)
  assert.deepEqual(memberIds(group), [90])
  assert.ok(!memberIds(group).includes(25))
  assert.ok(!memberIds(group).includes(44))
})

test('resolveClientGroup("sinch") returns only Sinch', () => {
  const group = resolveClientGroup(rows, "sinch")
  assert.ok(group)
  assert.deepEqual(memberIds(group), [12])
  assert.deepEqual([...group.nameSlugs], ["sinch"])
})

test('resolveClientGroup("nobody") returns null', () => {
  assert.equal(resolveClientGroup(rows, "nobody"), null)
})

test('resolveClientGroup("golf-australia") groups by exact mbaidentifier golf', () => {
  const group = resolveClientGroup(GOLF_CLIENT_ROWS, "golf-australia")
  assert.ok(group)
  assert.equal(group.anchor.id, 19)
  assert.equal(group.mbaidentifier, "golf")
  assert.deepEqual(memberIds(group), [19, 46])
})

test('resolveClientGroup("golf") matches mbaidentifier-slug, same group', () => {
  const group = resolveClientGroup(GOLF_CLIENT_ROWS, "golf")
  assert.ok(group)
  assert.equal(group.anchor.id, 19)
  assert.deepEqual(memberIds(group), [19, 46])
})

test('resolveClientGroup("golf-australia-self-run-campaigns") is a sibling of golf-australia', () => {
  const group = resolveClientGroup(GOLF_CLIENT_ROWS, "golf-australia-self-run-campaigns")
  assert.ok(group)
  assert.equal(group.anchor.id, 46)
  assert.deepEqual(memberIds(group), [19, 46])
})

test('resolveClientGroup("go-golfer") is exact — no prefix bleed into golf', () => {
  const group = resolveClientGroup(GOLF_CLIENT_ROWS, "go-golfer")
  assert.ok(group)
  assert.equal(group.anchor.id, 41)
  assert.deepEqual(memberIds(group), [41])
  assert.ok(!memberIds(group).includes(19))
})

test("clientIdsFromGroup returns the member id set", () => {
  const group = resolveClientGroup(GOLF_CLIENT_ROWS, "golf-australia")
  assert.ok(group)
  assert.deepEqual([...clientIdsFromGroup(group)].sort((a, b) => a - b), [19, 46])
})

test("clientIdsFromGroup on null is empty", () => {
  assert.deepEqual([...clientIdsFromGroup(null)], [])
})
