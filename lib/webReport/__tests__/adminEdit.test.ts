import assert from "node:assert/strict"
import { test } from "node:test"

import { isWebSearchFlagOn } from "@/lib/webReport/featureFlag"
import { resolveAdminWebReportEdit } from "@/lib/webReport/admin/access"
import type { BuilderDraft } from "@/lib/webReport/builder/repo"

const ROLE_CLAIM = "https://assembledview.com/roles"

function user(role: "admin" | "client") {
  return {
    sub: role,
    email: `${role}@example.com`,
    [ROLE_CLAIM]: [role],
  } as unknown as Parameters<typeof resolveAdminWebReportEdit>[0]["user"]
}

const draft = {
  clientId: 9,
  clientName: "Paul Hartmann Pty Ltd",
  migrationApplied: true,
  layout: [],
  currentVersion: 0,
  versions: [],
  ga4PropertyRef: "999",
  gscSiteRef: null,
  brandTerms: [],
  defaultPeriod: "last_month",
  keyEventNames: [],
} satisfies BuilderDraft

test("admin edit route opens the builder even when the client tab is switched off", async () => {
  const env = { ...process.env, FEATURE_WEB_SEARCH: "off" }
  assert.equal(isWebSearchFlagOn(env), false)

  const opened = await resolveAdminWebReportEdit({
    slug: "paul-hartmann",
    user: user("admin"),
    load: async (slug) => {
      assert.equal(slug, "paul-hartmann")
      return draft
    },
  })

  assert.equal(opened.kind, "builder")
  if (opened.kind === "builder") {
    assert.equal(opened.draft.clientName, "Paul Hartmann Pty Ltd")
  }
})

test("a non-admin is redirected away from the admin web report editor", async () => {
  let loaded = false
  const opened = await resolveAdminWebReportEdit({
    slug: "paul-hartmann",
    user: user("client"),
    load: async () => {
      loaded = true
      return draft
    },
  })
  assert.equal(opened.kind, "redirect")
  assert.equal(loaded, false)
})
