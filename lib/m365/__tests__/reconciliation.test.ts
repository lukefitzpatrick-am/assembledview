import assert from "node:assert/strict"
import test from "node:test"
import {
  M365_GRAPH_CHECK_PENDING,
  buildClientReconciliationRows,
  buildM365ReconciliationReport,
  findUnmatchedPlanMbas,
  hasMbaIdentifierCasingAnomaly,
  identifierGroupKey,
  mbaMatchesClientIdentifier,
} from "../reconciliation"
import { siteUrlForClient } from "../siteUrlForClient"

test("identifierGroupKey: trim + lower; empty → null", () => {
  assert.equal(identifierGroupKey("PENFOLD"), "penfold")
  assert.equal(identifierGroupKey("  penfold  "), "penfold")
  assert.equal(identifierGroupKey(""), null)
  assert.equal(identifierGroupKey("   "), null)
  assert.equal(identifierGroupKey(null), null)
})

test("hasMbaIdentifierCasingAnomaly: mixed casings in group", () => {
  assert.equal(hasMbaIdentifierCasingAnomaly(["PENFOLD", "penfold"]), true)
  assert.equal(hasMbaIdentifierCasingAnomaly(["penfold", "penfold"]), false)
  assert.equal(hasMbaIdentifierCasingAnomaly(["TheY"]), true)
  assert.equal(hasMbaIdentifierCasingAnomaly(["they"]), false)
  assert.equal(hasMbaIdentifierCasingAnomaly([null, ""]), false)
})

test("mbaMatchesClientIdentifier: prefix join (TI-1)", () => {
  assert.equal(mbaMatchesClientIdentifier("penfold001", ["PENFOLD"]), true)
  assert.equal(mbaMatchesClientIdentifier("golf019", ["golf", "pgaaus"]), true)
  assert.equal(mbaMatchesClientIdentifier("001001", ["penfold", "golf"]), false)
  assert.equal(mbaMatchesClientIdentifier("x91ack2mnd", ["x9"]), true)
  assert.equal(mbaMatchesClientIdentifier("x91ack2mnd", ["penfold"]), false)
  assert.equal(mbaMatchesClientIdentifier("", ["penfold"]), false)
})

test("buildClientReconciliationRows: groups share derived site URL", () => {
  const rows = buildClientReconciliationRows([
    {
      id: 44,
      mp_client_name: "Penfolds B",
      mbaidentifier: "PENFOLD",
      slug: "penfolds-b",
      sharepoint_site_url: null,
      teams_group_id: null,
      m365_is_anchor: false,
    },
    {
      id: 25,
      mp_client_name: "Penfolds A",
      mbaidentifier: "PENFOLD",
      slug: "penfolds-a",
      sharepoint_site_url: "/sites/cli-penfold",
      teams_group_id: "grp-1",
      m365_is_anchor: true,
    },
  ])

  assert.equal(rows.length, 2)
  assert.equal(rows[0]!.clientId, 25)
  assert.equal(rows[1]!.clientId, 44)
  assert.equal(rows[0]!.identifierGroupKey, "penfold")
  assert.equal(rows[0]!.derivedSiteUrl, siteUrlForClient("PENFOLD"))
  assert.equal(rows[1]!.derivedSiteUrl, rows[0]!.derivedSiteUrl)
  assert.equal(rows[0]!.isAnchor, true)
  assert.equal(rows[1]!.isAnchor, false)
  assert.equal(rows[0]!.storedSharepointSiteUrl, "/sites/cli-penfold")
  assert.equal(rows[0]!.storedTeamsGroupId, "grp-1")
  assert.equal(rows[0]!.dashboardSlug, "penfolds-a")
  assert.equal(rows[0]!.mbaidentifierCasingAnomaly, true)
  assert.equal(rows[0]!.groupMemberCount, 2)
  assert.equal(rows[0]!.checkedAgainstGraph, M365_GRAPH_CHECK_PENDING)
})

test("buildClientReconciliationRows: casing-consistent group is not anomalous", () => {
  const rows = buildClientReconciliationRows([
    { id: 1, mbaidentifier: "golf", m365_is_anchor: true },
    { id: 2, mbaidentifier: "golf", m365_is_anchor: false },
  ])
  assert.equal(rows[0]!.mbaidentifierCasingAnomaly, false)
  assert.equal(rows[0]!.derivedSiteUrl, "/sites/cli-golf")
})

test("findUnmatchedPlanMbas: TI-1 §3a junk set", () => {
  const clients = [
    { id: 1, mbaidentifier: "penfold" },
    { id: 2, mbaidentifier: "golf" },
  ]
  const plans = [
    { id: 10, mba_number: "penfold001", campaign_name: "ok" },
    { id: 157, mba_number: "001001", mp_client_name: "??" },
    { id: 298, mba_number: "x91ack2mnd", campaign_name: "junk" },
    { id: 11, mba_number: "golf019" },
  ]
  const unmatched = findUnmatchedPlanMbas(plans, clients)
  assert.deepEqual(
    unmatched.map((u) => u.mbaNumber),
    ["001001", "x91ack2mnd"]
  )
  assert.equal(unmatched[0]!.reason, "no_matching_client_identifier")
  assert.equal(unmatched[0]!.masterId, 157)
})

test("buildM365ReconciliationReport: joins clients + unmatched plans", () => {
  const report = buildM365ReconciliationReport(
    [
      { id: 1, mbaidentifier: "buxton", slug: "buxton-a", m365_is_anchor: true },
      { id: 2, mbaidentifier: "buxton", slug: "buxton-b", m365_is_anchor: false },
      { id: 3, mbaidentifier: "", slug: "no-id" },
    ],
    [
      { id: 100, mba_number: "buxton001" },
      { id: 101, mba_number: "x9seqcccm5t" },
    ]
  )
  assert.equal(report.clientRows.length, 3)
  assert.equal(report.identifierGroups.length, 2) // buxton + empty singleton
  assert.equal(report.unmatchedPlans.length, 1)
  assert.equal(report.unmatchedPlans[0]!.mbaNumber, "x9seqcccm5t")
  assert.equal(
    report.clientRows.every((r) => r.checkedAgainstGraph === M365_GRAPH_CHECK_PENDING),
    true
  )
})

test("buildClientReconciliationRows: flag-on still skeleton Graph copy", () => {
  const rows = buildClientReconciliationRows([{ id: 1, mbaidentifier: "a" }], {
    provisioningEnabled: true,
  })
  assert.equal(rows[0]!.checkedAgainstGraph, "pending — Graph check not wired")
})
