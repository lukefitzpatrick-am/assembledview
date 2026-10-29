/**
 * /admin/web-reports/[slug] renders the builder without the client-tab flag.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"
import { isWebSearchFlagOn } from "@/lib/webReport/featureFlag"

const skip = mockModuleSkip()

const ROLE_CLAIM = "https://assembledview.com/roles"

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
  defaultPeriod: "last_month" as const,
  keyEventNames: [],
}

const getSessionMock = mock.fn(async () => ({
  user: {
    sub: "admin",
    email: "admin@example.com",
    [ROLE_CLAIM]: ["admin"],
  },
}))

const loadMock = mock.fn(async (_slug: string) => draft)

if (typeof mock.module === "function") {
  await mock.module("@/lib/auth0", {
    namedExports: { auth0: { getSession: getSessionMock } },
  })
  await mock.module("@/lib/webReport/builder/repo", {
    namedExports: { loadBuilderDraft: loadMock },
  })
  await mock.module("next/navigation", {
    namedExports: {
      notFound: () => {
        throw new Error("NOT_FOUND")
      },
      redirect: (url: string) => {
        throw new Error(`REDIRECT:${url}`)
      },
    },
  })
  await mock.module("@/components/dashboard/web/ReportBuilder", {
    namedExports: {
      ReportBuilder: function ReportBuilder() {
        return null
      },
    },
  })
}

test(
  "admin edit route renders the builder even when the client tab is switched off",
  { skip },
  async () => {
    process.env.FEATURE_WEB_SEARCH = "off"
    assert.equal(await isWebSearchFlagOn(), false)

    const { WebReportBuilderScreen } = await import(
      "@/components/dashboard/web/WebReportBuilderScreen.js"
    )
    const { default: Page } = await import("../[slug]/page.js")
    const element = await Page({ params: Promise.resolve({ slug: "paul-hartmann" }) })
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children]
    const screen = children.find(
      (child: { type?: unknown }) => child?.type === WebReportBuilderScreen,
    )
    assert.ok(screen)
    assert.equal(screen.props.slug, "paul-hartmann")
    assert.equal(screen.props.draft.clientName, "Paul Hartmann Pty Ltd")
    assert.equal(loadMock.mock.calls.length, 1)
  },
)
