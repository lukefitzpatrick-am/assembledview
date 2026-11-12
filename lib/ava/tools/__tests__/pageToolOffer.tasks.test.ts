/**
 * F14 (B36): Ava on /tasks fails closed. Pins the exact /tasks tool set,
 * the capture-tool tag (fixture tool, since none exist yet) and the
 * web-search rule.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { AVA_TOOL_NAMES } from "../summaries.js"
import {
  avaToolDefinitionsForPage,
  avaWebSearchAllowed,
  isTasksSurface,
  type AvaToolFlags,
} from "../pageToolOffer.js"
import {
  AVA_TOOL_TAGS,
  TASKS_TOOL_ALLOWLIST,
  avaToolTag,
  isCaptureTool,
  isReadTool,
  type AvaToolTagLookup,
} from "../toolAccess.js"
import { isTasksPath, normaliseRoutePath, shouldResetConversationOnRouteChange } from "../../conversationScope.js"

const ALL_ON: AvaToolFlags = { billingRevisions: true, trueUp: true }
const REGISTRY = AVA_TOOL_NAMES.map((name) => ({ name }))

/** The exact set Ava is offered on /tasks today. Changing it is a security decision. */
const PINNED_TASKS_SET = [
  "calculate_media_math",
  "get_best_practice",
  "get_brand_assets",
  "get_campaign_context",
  "get_campaign_insights",
  "get_client_brain",
  "get_client_details",
  "get_client_insights",
  "get_creative_assets",
  "get_delivery_snapshot",
  "get_media_plan_summary",
  "get_methodology",
  "get_naming_rules",
  "get_pacing_snapshot",
  "get_platform_specs",
  "get_saved_audiences",
  "load_skill",
  "query_campaign_lines",
  "query_finance_summary",
  "query_schedule_months",
  "query_xero_status",
  "search_line_items",
]

const WRITE_TOOLS_NAMED_IN_THE_PLAN = [
  "accept_ingest_proposal",
  "save_client_brain",
  "apply_parsed_plan",
  "apply_form_patch",
  "adjust_line_items",
  "load_ingest_into_form",
  "generate_mi_workbook",
  "generate_naming_workbook",
  "generate_performance_report",
  "start_mi_interview",
  "apply_billing_revision",
  "preview_billing_revision",
  "get_pending_ingest_review",
]

const CAPTURE_FIXTURE = "summarise_capture_fixture"
const withFixture: AvaToolTagLookup = (name) =>
  name === CAPTURE_FIXTURE ? { access: "read", capture: true } : avaToolTag(name)
const REGISTRY_PLUS_FIXTURE = [...REGISTRY, { name: CAPTURE_FIXTURE }]

function names(list: { name: string }[]): string[] {
  return list.map((t) => t.name).sort()
}

function pc(pathname: string) {
  return { route: { pathname } }
}

describe("F14 /tasks allowlist", () => {
  it("offers exactly the pinned set on /tasks (all switches on)", () => {
    assert.deepEqual(names(avaToolDefinitionsForPage(REGISTRY, pc("/tasks"), ALL_ON)), PINNED_TASKS_SET)
  })

  it("the same set under /tasks/<id> and from the widget route alone (no PageContext)", () => {
    assert.deepEqual(names(avaToolDefinitionsForPage(REGISTRY, pc("/tasks/482"), ALL_ON)), PINNED_TASKS_SET)
    assert.deepEqual(
      names(avaToolDefinitionsForPage(REGISTRY, undefined, ALL_ON, { clientRoute: "/tasks" })),
      PINNED_TASKS_SET,
    )
    assert.deepEqual(
      names(avaToolDefinitionsForPage(REGISTRY, undefined, ALL_ON, { clientRoute: "/tasks/9?view=list" })),
      PINNED_TASKS_SET,
    )
  })

  it("the allowlist constant is the pinned set, read tools only, all registered", () => {
    assert.deepEqual([...TASKS_TOOL_ALLOWLIST].sort(), PINNED_TASKS_SET)
    for (const name of TASKS_TOOL_ALLOWLIST) {
      assert.ok((AVA_TOOL_NAMES as readonly string[]).includes(name), name)
      assert.equal(isReadTool(name), true, name)
    }
  })

  it("never offers a write tool on /tasks", () => {
    const offered = names(avaToolDefinitionsForPage(REGISTRY, pc("/tasks"), ALL_ON))
    for (const name of WRITE_TOOLS_NAMED_IN_THE_PLAN) {
      assert.equal(offered.includes(name), false, name)
      assert.equal(AVA_TOOL_TAGS[name as keyof typeof AVA_TOOL_TAGS].access, "write", name)
    }
  })

  it("fails closed for a tool that is not on the allowlist, tagged or not", () => {
    const defs = [...REGISTRY, { name: "brand_new_tool" }, { name: "another_read_tool" }]
    const tagOf: AvaToolTagLookup = (name) => (name === "another_read_tool" ? { access: "read" } : avaToolTag(name))
    const offered = names(avaToolDefinitionsForPage(defs, pc("/tasks"), ALL_ON, { tagOf }))
    assert.deepEqual(offered, PINNED_TASKS_SET)
  })

  it("a route that only looks like /tasks is not /tasks", () => {
    assert.equal(isTasksPath("/tasksfoo"), false)
    assert.equal(isTasksPath("/admin/tasks"), false)
    assert.equal(isTasksPath("tasks"), false)
    assert.equal(isTasksPath("/tasks/"), true)
    assert.equal(normaliseRoutePath("/tasks/12/?a=1#x"), "/tasks/12")
    const offered = names(avaToolDefinitionsForPage(REGISTRY, pc("/tasksfoo"), ALL_ON))
    assert.ok(offered.includes("apply_form_patch"))
  })

  it("either route saying /tasks applies the allowlist (stale context cannot widen it)", () => {
    assert.equal(isTasksSurface(pc("/mediaplans/create"), "/tasks"), true)
    assert.equal(isTasksSurface(pc("/tasks"), "/clients"), true)
    const offered = names(avaToolDefinitionsForPage(REGISTRY, pc("/mediaplans/create"), ALL_ON, { clientRoute: "/tasks" }))
    assert.deepEqual(offered, PINNED_TASKS_SET)
  })

  it("other pages are unchanged by the widget route", () => {
    const before = names(avaToolDefinitionsForPage(REGISTRY, pc("/mediaplans/create"), ALL_ON))
    const after = names(avaToolDefinitionsForPage(REGISTRY, pc("/mediaplans/create"), ALL_ON, { clientRoute: "/mediaplans/create" }))
    assert.deepEqual(after, before)
    assert.ok(after.includes("apply_form_patch"))
    const none = names(avaToolDefinitionsForPage(REGISTRY, undefined, ALL_ON))
    const noneWithRoute = names(avaToolDefinitionsForPage(REGISTRY, undefined, ALL_ON, { clientRoute: "/clients" }))
    assert.deepEqual(noneWithRoute, none)
  })
})

describe("F14 (a) capture tools on /tasks only", () => {
  it("offers a capture-tagged tool on /tasks", () => {
    const offered = names(avaToolDefinitionsForPage(REGISTRY_PLUS_FIXTURE, pc("/tasks"), ALL_ON, { tagOf: withFixture }))
    assert.ok(offered.includes(CAPTURE_FIXTURE))
    assert.deepEqual(
      offered.filter((n) => n !== CAPTURE_FIXTURE),
      PINNED_TASKS_SET,
    )
  })

  it("never offers it anywhere else", () => {
    for (const path of ["/mediaplans/create", "/mediaplans/mba/abc001/edit", "/pacing/portfolio", "/finance", "/dashboard/a/b", "/clients"]) {
      const offered = names(avaToolDefinitionsForPage(REGISTRY_PLUS_FIXTURE, pc(path), ALL_ON, { tagOf: withFixture }))
      assert.equal(offered.includes(CAPTURE_FIXTURE), false, path)
    }
    const noRoute = names(avaToolDefinitionsForPage(REGISTRY_PLUS_FIXTURE, undefined, ALL_ON, { tagOf: withFixture }))
    assert.equal(noRoute.includes(CAPTURE_FIXTURE), false)
    const campaignRead = names(
      avaToolDefinitionsForPage(
        REGISTRY_PLUS_FIXTURE,
        { route: { pathname: "/tasks" }, state: { surface: "campaign-read-generate" } },
        ALL_ON,
        { tagOf: withFixture },
      ),
    )
    assert.equal(campaignRead.includes(CAPTURE_FIXTURE), false)
  })

  it("a capture tag on a write tool is never offered", () => {
    const tagOf: AvaToolTagLookup = (name) =>
      name === "bad_capture_writer" ? { access: "write", capture: true } : avaToolTag(name)
    assert.equal(isCaptureTool("bad_capture_writer", tagOf), false)
    for (const path of ["/tasks", "/clients"]) {
      const offered = names(avaToolDefinitionsForPage([...REGISTRY, { name: "bad_capture_writer" }], pc(path), ALL_ON, { tagOf }))
      assert.equal(offered.includes("bad_capture_writer"), false, path)
    }
  })

  it("no registry tool is a capture tool today", () => {
    for (const name of AVA_TOOL_NAMES) assert.equal(isCaptureTool(name), false, name)
  })
})

describe("F14 web search", () => {
  it("is off on /tasks and on in a clean conversation elsewhere", () => {
    assert.equal(avaWebSearchAllowed(pc("/tasks")), false)
    assert.equal(avaWebSearchAllowed(undefined, { clientRoute: "/tasks/3" }), false)
    assert.equal(avaWebSearchAllowed(pc("/clients")), true)
    assert.equal(avaWebSearchAllowed(undefined), true)
  })

  it("is off when the chat request named no route (L1)", () => {
    assert.equal(avaWebSearchAllowed(pc("/clients"), { routeUnknown: true }), false)
    assert.equal(avaWebSearchAllowed(undefined, { routeUnknown: true }), false)
  })
})

describe("F14 L1: a chat request with no route gets read tools only", () => {
  const readOnly = (list: string[]) => list.filter((n) => isReadTool(n))

  it("no route and no PageContext: read tools only, no capture tool", () => {
    const offered = names(
      avaToolDefinitionsForPage(REGISTRY_PLUS_FIXTURE, undefined, ALL_ON, { routeUnknown: true, tagOf: withFixture }),
    )
    assert.ok(offered.length > 0)
    for (const name of offered) assert.equal(isReadTool(name, withFixture), true, name)
    assert.equal(offered.includes(CAPTURE_FIXTURE), false)
    assert.equal(offered.includes("apply_form_patch"), false)
    assert.equal(offered.includes("save_client_brain"), false)
  })

  it("no route with a write-page PageContext: still read tools only (it may be an old /tasks chat)", () => {
    for (const path of ["/mediaplans/create", "/mediaplans/mba/abc001/edit", "/finance", "/clients"]) {
      const known = names(avaToolDefinitionsForPage(REGISTRY, pc(path), ALL_ON))
      const offered = names(avaToolDefinitionsForPage(REGISTRY, pc(path), ALL_ON, { routeUnknown: true }))
      assert.deepEqual(offered, readOnly(known), path)
    }
  })

  it("with a route the page rules are unchanged", () => {
    const before = names(avaToolDefinitionsForPage(REGISTRY, pc("/mediaplans/create"), ALL_ON))
    const after = names(
      avaToolDefinitionsForPage(REGISTRY, pc("/mediaplans/create"), ALL_ON, {
        clientRoute: "/mediaplans/create",
        routeUnknown: false,
      }),
    )
    assert.deepEqual(after, before)
    assert.ok(after.includes("apply_form_patch"))
  })
})

describe("F14 tool tags", () => {
  it("every registered tool has a tag and an unknown name has none", () => {
    for (const name of AVA_TOOL_NAMES) assert.ok(avaToolTag(name), name)
    assert.equal(Object.keys(AVA_TOOL_TAGS).length, AVA_TOOL_NAMES.length)
    assert.equal(avaToolTag("not_a_tool"), undefined)
    assert.equal(avaToolTag("constructor"), undefined)
    assert.equal(isReadTool("not_a_tool"), false)
  })
})

describe("F14 (c) conversation reset rule", () => {
  it("resets only when the route leaves /tasks", () => {
    assert.equal(shouldResetConversationOnRouteChange("/tasks", "/clients"), true)
    assert.equal(shouldResetConversationOnRouteChange("/tasks/4", "/mediaplans/mba/x/edit"), true)
    assert.equal(shouldResetConversationOnRouteChange("/tasks", undefined), true)
    assert.equal(shouldResetConversationOnRouteChange("/tasks", "/tasks/4"), false)
    assert.equal(shouldResetConversationOnRouteChange("/clients", "/tasks"), false)
    assert.equal(shouldResetConversationOnRouteChange("/clients", "/pacing"), false)
    assert.equal(shouldResetConversationOnRouteChange(undefined, "/clients"), false)
  })
})
