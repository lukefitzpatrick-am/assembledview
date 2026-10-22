import assert from "node:assert/strict"
import test from "node:test"

import {
  financeOwnerNameByClient,
  mergeFinanceOwnerRows,
  parseFinanceOwnerUpdate,
} from "../financeOwners.js"
import { isMissingFinanceOwnersTable } from "../financeOwnersStore.js"

test("parse: sets an owner from numbers or numeric strings", () => {
  assert.deepEqual(parseFinanceOwnerUpdate({ client_id: 25, team_member_id: 3 }), {
    ok: true,
    value: { clientId: 25, teamMemberId: 3 },
  })
  assert.deepEqual(parseFinanceOwnerUpdate({ client_id: "25", team_member_id: "3" }), {
    ok: true,
    value: { clientId: 25, teamMemberId: 3 },
  })
})

test("parse: null or empty team member clears the owner", () => {
  assert.deepEqual(parseFinanceOwnerUpdate({ client_id: 25, team_member_id: null }), {
    ok: true,
    value: { clientId: 25, teamMemberId: null },
  })
  assert.deepEqual(parseFinanceOwnerUpdate({ client_id: 25, team_member_id: "" }), {
    ok: true,
    value: { clientId: 25, teamMemberId: null },
  })
})

test("parse: refuses bad bodies", () => {
  for (const body of [
    null,
    [],
    "x",
    {},
    { client_id: 0, team_member_id: 1 },
    { client_id: -2, team_member_id: 1 },
    { client_id: 1.5, team_member_id: 1 },
    { client_id: 1 },
    { client_id: 1, team_member_id: "abc" },
    { client_id: 1, team_member_id: 0 },
  ]) {
    assert.equal(parseFinanceOwnerUpdate(body).ok, false, JSON.stringify(body))
  }
})

test("merge: every client once, sorted, owner fields only where a row exists", () => {
  const rows = mergeFinanceOwnerRows({
    clients: [
      { id: 2, name: "Penfolds" },
      { id: 1, name: "bic" },
      { id: 3, name: "  " },
    ],
    owners: [
      { clientId: 2, teamMemberId: 7, ownerName: "Sam", updatedAt: "2026-10-22T01:00:00Z", updatedByName: "Luke" },
      { clientId: 1, teamMemberId: null, ownerName: null, updatedAt: "2026-10-22T01:00:00Z", updatedByName: "Luke" },
    ],
  })
  assert.deepEqual(rows.map((r) => r.clientName), ["bic", "Client 3", "Penfolds"])
  assert.equal(rows[2].ownerName, "Sam")
  assert.equal(rows[0].teamMemberId, null)
  assert.equal(rows[0].ownerName, null)
  assert.equal(rows[1].updatedAt, null)
})

test("owner name map skips unowned and blank names", () => {
  const map = financeOwnerNameByClient([
    { clientId: 1, clientName: "A", teamMemberId: 7, ownerName: "Sam", updatedAt: null, updatedByName: null },
    { clientId: 2, clientName: "B", teamMemberId: null, ownerName: null, updatedAt: null, updatedByName: null },
    { clientId: 3, clientName: "C", teamMemberId: 8, ownerName: " ", updatedAt: null, updatedByName: null },
  ])
  assert.deepEqual([...map.entries()], [[1, "Sam"]])
})

test("missing table detection reads the code and nested causes", () => {
  assert.equal(isMissingFinanceOwnersTable({ code: "42P01", message: "relation does not exist" }), true)
  assert.equal(
    isMissingFinanceOwnersTable(
      new Error("query failed", { cause: { message: 'relation "client_finance_owners" does not exist' } }),
    ),
    true,
  )
  assert.equal(isMissingFinanceOwnersTable(new Error("connection reset")), false)
})
