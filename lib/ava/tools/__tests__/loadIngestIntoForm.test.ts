/**
 * load_ingest_into_form + surface-aware accept_ingest_proposal offer.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { buildAvaSystemPrompt } from "@/lib/ava/buildAvaSystemPrompt"
import type { PageContext } from "@/lib/ava/types"
import { loadIngestIntoFormTool } from "../loadIngestIntoForm.js"
import { avaToolDefinitionsForPage } from "../pageToolOffer.js"
import type { AvaToolContext } from "../types.js"

const OFFERED = [
  { name: "get_pending_ingest_review" },
  { name: "accept_ingest_proposal" },
  { name: "load_ingest_into_form" },
] as const

function ctx(overrides: Partial<AvaToolContext> = {}): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "u1",
    userEmail: "ava@assembledmedia.com.au",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    pendingIngest: {
      stageId: "stage-should-not-be-touched",
      fileName: "qms.xlsx",
    },
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...overrides,
  }
}

function toolNames(pageContext?: PageContext) {
  return avaToolDefinitionsForPage(OFFERED, pageContext).map((t) => t.name)
}

test("buildTools excludes accept_ingest_proposal on create", () => {
  const names = toolNames({ route: "/mediaplans/create" })
  assert.equal(names.includes("accept_ingest_proposal"), false)
  assert.equal(names.includes("load_ingest_into_form"), true)
})

test("buildTools excludes accept_ingest_proposal on edit", () => {
  const names = toolNames({
    route: { pathname: "/mediaplans/mba/qmsround01/edit" },
  })
  assert.equal(names.includes("accept_ingest_proposal"), false)
  assert.equal(names.includes("load_ingest_into_form"), true)
})

test("buildTools includes accept_ingest_proposal on the Hub route", () => {
  const names = toolNames({ route: "/admin/schedule-ingest" })
  assert.equal(names.includes("accept_ingest_proposal"), true)
  assert.equal(names.includes("load_ingest_into_form"), true)
})

test("buildTools excludes accept_ingest_proposal when the route is absent", () => {
  assert.equal(toolNames(undefined).includes("accept_ingest_proposal"), false)
  assert.equal(
    toolNames({}).includes("accept_ingest_proposal"),
    false,
  )
})

test("load_ingest_into_form without confirm: true refuses and writes nothing", async () => {
  const c = ctx()
  const denied = await loadIngestIntoFormTool.execute({ confirm: false }, c)
  assert.equal(denied.isError, true)
  assert.match(denied.content, /load_ingest_into_form refused: confirm must be true/)
  assert.equal(c.capturedLineItemsLoad, null)
  assert.doesNotMatch(denied.content, /expired/i)
  assert.doesNotMatch(denied.content, /stage-should-not-be-touched/)
})

test("create/edit system prompt loads into the form and does not describe accepting into a plan", () => {
  const create = buildAvaSystemPrompt("mediaplan_create", {
    route: "/mediaplans/create",
  })
  assert.match(create, /load_ingest_into_form/)
  assert.match(create, /form for human review/i)
  assert.doesNotMatch(
    create.slice(create.toLowerCase().lastIndexOf("on this media-plan")),
    /accept_ingest_proposal/,
  )
  const edit = buildAvaSystemPrompt("mediaplan_edit", {
    route: { pathname: "/mediaplans/mba/foo/edit" },
  })
  assert.match(edit, /load_ingest_into_form/)
  assert.doesNotMatch(edit, /accept the schedule into a plan/i)
})
