/** S17: /data-quality is for admins only, not found with the switch off, and opens the ops list on the overdue view. */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import React from "react"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

let session: { user: { email: string; roles: string[] } } | null = null
let switchOn = true

if (typeof mock.module === "function") {
  await mock.module("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module("@/lib/rbac", {
    namedExports: { getUserRoles: (user: { roles: string[] }) => user.roles },
  })
  await mock.module("@/lib/features/server", {
    namedExports: { isFeatureOn: async (key: string) => key === "data_quality_queue" && switchOn },
  })
  await mock.module("@/lib/email/sendHtmlEmail", {
    namedExports: { getOpsEmailRecipients: () => ["Luke@AM.test"] },
  })
  await mock.module("next/navigation", {
    namedExports: {
      redirect: (to: string) => {
        throw new Error(`redirect ${to}`)
      },
      notFound: () => {
        throw new Error("not found")
      },
    },
  })
  await mock.module("@/components/dataQuality/DataQualityClient", {
    namedExports: { DataQualityClient: () => null },
  })
}

// The node runner compiles JSX to React.createElement.
;(globalThis as { React?: typeof React }).React = React
const { default: Page } = await import("../page")

async function outcome(): Promise<string | { viewerEmail: string; overviewByDefault: boolean }> {
  try {
    const el = (await Page()) as { props: { viewerEmail: string; overviewByDefault: boolean } }
    return el.props
  } catch (err) {
    return (err as Error).message
  }
}

test("signed out: login; a client: unauthorised; switch off: not found", { skip }, async () => {
  session = null
  assert.equal(await outcome(), "redirect /auth/login?returnTo=/data-quality")
  session = { user: { email: "c@client.test", roles: ["client"] } }
  assert.equal(await outcome(), "redirect /unauthorized")
  session = { user: { email: "me@am.test", roles: ["admin"] } }
  switchOn = false
  assert.equal(await outcome(), "not found")
  switchOn = true
})

test("the ops list opens on the overdue view; everyone else on their own", { skip }, async () => {
  session = { user: { email: "luke@am.test", roles: ["admin"] } }
  assert.deepEqual(await outcome(), { viewerEmail: "luke@am.test", overviewByDefault: true })
  session = { user: { email: "Me@AM.test", roles: ["admin"] } }
  assert.deepEqual(await outcome(), { viewerEmail: "me@am.test", overviewByDefault: false })
})
