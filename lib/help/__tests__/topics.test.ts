import assert from "node:assert/strict"
import test from "node:test"

import { HELP_TIPS, HELP_TOPICS, helpTopicFor } from "@/lib/help/topics"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"

test("every topic is keyed by a real route", () => {
  for (const key of Object.keys(HELP_TOPICS)) assert.ok(getRouteByExactPath(key), `${key} is not in the route manifest`)
})

test("a page uses its own topic, else its nearest parent's", () => {
  assert.equal(helpTopicFor("/mediaplans/mba/ABC001/edit")?.title, "Edit a campaign")
  assert.equal(helpTopicFor("/finance/invoicing")?.title, "Clients billing: to bill")
  assert.equal(helpTopicFor("/finance/forecasting")?.title, "Finance")
  assert.equal(helpTopicFor("/pacing/social")?.title, "Pacing")
  assert.equal(helpTopicFor("/dashboard/acme/ACME001")?.title, "Campaign dashboard")
  assert.equal(helpTopicFor("/dashboard/acme")?.title, "Dashboards")
  assert.equal(helpTopicFor("/profile"), null)
})

test("plan walkthrough anchors are the wizard step ids", async () => {
  const { PLAN_CAMPAIGN_STEPS } = await import("@/app/mediaplans/_form/planFormChrome")
  const ids = PLAN_CAMPAIGN_STEPS.map((s) => s.id)
  for (const key of ["/mediaplans/create", "/mediaplans/mba/[mba_number]/edit"]) {
    const anchors = HELP_TOPICS[key].steps?.flatMap((s) => (s.anchor ? [s.anchor] : []))
    assert.deepEqual(anchors, ids)
  }
})

test("copy follows the house style: no em dashes, full sentences", () => {
  const all = [
    ...Object.values(HELP_TIPS),
    ...Object.values(HELP_TOPICS).flatMap((t) => [t.title, t.summary, ...(t.tips ?? []), ...(t.steps ?? []).map((s) => s.text)]),
  ]
  for (const text of all) assert.ok(!text.includes("—"), text)
  for (const t of Object.values(HELP_TOPICS)) assert.match(t.summary, /\.$/, t.title)
})
