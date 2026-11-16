/**
 * B44 (C-200, switch codex_contained_writes): the /tasks compose link. Each
 * param is whitelisted, capped and checked; HTML is refused; an unknown client
 * or MBA is left out with a note; a link built by the builder reads back whole.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  COMPOSE_DESCRIPTION_MAX,
  COMPOSE_TITLE_MAX,
  TASKS_COMPOSE_PARAMS,
  buildTasksComposeHref,
  parseTasksComposeParams,
  resolveComposePrefill,
  tasksForMbaHref,
  withoutComposeParams,
} from "../composeLink.js"

const qs = (s: string) => new URLSearchParams(s)
const parse = (s: string) => parseTasksComposeParams(qs(s))
const fromHref = (href: string) => {
  assert.ok(href.startsWith("/tasks?"), href)
  return parseTasksComposeParams(new URL(href, "https://app.test").searchParams)
}

test("compose: only task or help opens anything; no compose reads nothing", () => {
  assert.deepEqual(parse(""), { compose: null, prefill: {}, notes: [] })
  assert.deepEqual(parse("pf_title=Hello&pf_client=42"), { compose: null, prefill: {}, notes: [] })
  assert.deepEqual(parse("compose=delete&pf_title=Hello"), { compose: null, prefill: {}, notes: [] })
  assert.deepEqual(parse("compose=TASK"), { compose: null, prefill: {}, notes: [] })
  assert.equal(parse("compose=task").compose, "task")
  assert.equal(parse("compose=help").compose, "help")
})

test("whitelist: params outside the list are never read into the prefill", () => {
  const out = parse(
    "compose=task&pf_title=A&assignee_email=evil@x.com&status=done&pf_status=done&client_visible=1&id=5&pf_assignee=a@b.c",
  )
  assert.deepEqual(out.prefill, { title: "A" })
  assert.deepEqual(out.notes, [])
  assert.deepEqual([...TASKS_COMPOSE_PARAMS], ["compose", "pf_title", "pf_desc", "pf_client", "pf_mba", "pf_category"])
})

test("pf_title: one line, trimmed, control characters removed, capped", () => {
  assert.equal(parse("compose=task&pf_title=%20%20Fix%0A%0Athe%09%20pacing%20%20").prefill.title, "Fix the pacing")
  assert.equal(parse("compose=task&pf_title=a%00b%E2%80%AEc").prefill.title, "abc")
  const long = "x".repeat(COMPOSE_TITLE_MAX + 10)
  const out = parse(`compose=task&pf_title=${long}`)
  assert.equal(out.prefill.title!.length, COMPOSE_TITLE_MAX)
  assert.ok(out.prefill.title!.endsWith("…"))
  assert.match(out.notes.join(" "), /title in the link was shortened to 300/)
  assert.equal(parse("compose=task&pf_title=%20%20").prefill.title, undefined)
})

test("pf_desc: keeps lines, trims trailing space, caps runs of blank lines and length", () => {
  const out = parse("compose=task&pf_desc=" + encodeURIComponent("Line one  \r\n- a\n\n\n\n- b\n"))
  assert.equal(out.prefill.description, "Line one\n- a\n\n- b")
  const long = "y".repeat(COMPOSE_DESCRIPTION_MAX + 1)
  const capped = parse(`compose=task&pf_desc=${long}`)
  assert.equal(capped.prefill.description!.length, COMPOSE_DESCRIPTION_MAX)
  assert.match(capped.notes.join(" "), /description in the link was shortened to 2000/)
})

test("pf_client: a positive integer id only", () => {
  assert.equal(parse("compose=task&pf_client=42").prefill.clientId, 42)
  assert.equal(parse("compose=task&pf_client=%2042%20").prefill.clientId, 42)
  for (const bad of ["0", "-1", "4.2", "42abc", "1e3", "0x2a", "", "9999999999999", "042"]) {
    const out = parse(`compose=task&pf_client=${encodeURIComponent(bad)}`)
    assert.equal(out.prefill.clientId, undefined, bad)
    assert.match(out.notes.join(" "), /client in the link is not a client id/, bad)
  }
})

test("pf_mba: an MBA number shape only, 40 characters at most", () => {
  assert.equal(parse("compose=task&pf_mba=BICAU002").prefill.mbaNumber, "BICAU002")
  assert.equal(parse("compose=task&pf_mba=sinch001").prefill.mbaNumber, "sinch001")
  assert.equal(parse("compose=task&pf_mba=ASM-2026.01_a").prefill.mbaNumber, "ASM-2026.01_a")
  assert.equal(
    parse("compose=task&pf_mba=" + encodeURIComponent("Historical OX and Harty Clients001")).prefill.mbaNumber,
    "Historical OX and Harty Clients001",
  )
  assert.equal(parse("compose=task&pf_mba=%20BICAU002%20").prefill.mbaNumber, "BICAU002")
  for (const bad of ["../etc", " -lead", "-lead", "a/b", "a;drop", "a\tb", "x".repeat(41), "%", "a<b"]) {
    const out = parse(`compose=task&pf_mba=${encodeURIComponent(bad)}`)
    assert.equal(out.prefill.mbaNumber, undefined, bad)
    assert.match(out.notes.join(" "), /MBA in the link is not an MBA number/, bad)
  }
})

test("pf_category: one of the task categories only", () => {
  assert.equal(parse("compose=task&pf_category=pacing").prefill.category, "pacing")
  assert.equal(parse("compose=task&pf_category=creative").prefill.category, "creative")
  const out = parse("compose=task&pf_category=Pacing")
  assert.equal(out.prefill.category, undefined)
  assert.match(out.notes[0], /category in the link is not one of/)
})

test("hostile values: HTML is refused, a huge value is dropped, a repeated param keeps the first", () => {
  const html = parse(
    "compose=task&pf_title=" +
      encodeURIComponent('<img src=x onerror="alert(1)">') +
      "&pf_desc=" +
      encodeURIComponent("ok </textarea><script>alert(1)</script>"),
  )
  assert.deepEqual(html.prefill, {})
  assert.match(html.notes.join(" "), /title in the link had HTML/)
  assert.match(html.notes.join(" "), /description in the link had HTML/)
  assert.equal(parse("compose=task&pf_title=" + encodeURIComponent("a > b")).prefill.title, undefined)

  const huge = parse(`compose=task&pf_title=${"z".repeat(COMPOSE_TITLE_MAX * 4 + 1)}`)
  assert.equal(huge.prefill.title, undefined)
  assert.match(huge.notes[0], /too long and was left out/)

  const twice = parse("compose=task&pf_client=1&pf_client=2&pf_title=First&pf_title=Second")
  assert.equal(twice.prefill.clientId, 1)
  assert.equal(twice.prefill.title, "First")
  assert.equal(twice.notes.length, 2)

  const js = parse("compose=task&pf_mba=" + encodeURIComponent("javascript:alert(1)"))
  assert.equal(js.prefill.mbaNumber, undefined)
})

test("resolve: an unknown client is left out with its MBA; an MBA not on the client is left out", () => {
  const parsed = parse("compose=help&pf_client=42&pf_mba=bicau002&pf_title=T")
  const ok = resolveComposePrefill(parsed, { clientIds: new Set([42]), mbasForClient: new Set(["BICAU002"]) })
  assert.deepEqual(ok.prefill, { title: "T", clientId: 42, mbaNumber: "BICAU002" })
  assert.deepEqual(ok.notes, [])

  const noClient = resolveComposePrefill(parsed, { clientIds: new Set([7]), mbasForClient: null })
  assert.deepEqual(noClient.prefill, { title: "T" })
  assert.match(noClient.notes[0], /Client 42 from the link was not found/)
  assert.match(noClient.notes[1], /needs a client to check it against/)

  const otherMba = resolveComposePrefill(parsed, { clientIds: new Set([42]), mbasForClient: new Set(["OTHER001"]) })
  assert.deepEqual(otherMba.prefill, { title: "T", clientId: 42 })
  assert.match(otherMba.notes[0], /not one of this client's campaigns/)

  const unread = resolveComposePrefill(parsed, { clientIds: new Set([42]), mbasForClient: null })
  assert.deepEqual(unread.prefill, { title: "T", clientId: 42 })
  assert.match(unread.notes[0], /could not be checked/)

  const clientsUnread = resolveComposePrefill(parsed, { clientIds: null, mbasForClient: null })
  assert.deepEqual(clientsUnread.prefill, { title: "T" })
  assert.match(clientsUnread.notes[0], /Client 42 from the link could not be checked/)

  const mbaOnly = resolveComposePrefill(parse("compose=task&pf_mba=BICAU002"), { clientIds: new Set([42]), mbasForClient: null })
  assert.deepEqual(mbaOnly.prefill, {})
  assert.equal(mbaOnly.compose, "task")
})

test("builder: a link built here reads back whole, and never carries what the parser refuses", () => {
  const href = buildTasksComposeHref({
    compose: "help",
    title: "  Pacing\nhelp  ",
    description: "Line 1\n\nLine 2 → $1,200",
    clientId: 42,
    mbaNumber: "BICAU002",
    category: "pacing",
  })
  assert.equal(
    href,
    "/tasks?compose=help&pf_title=Pacing+help&pf_desc=Line+1%0A%0ALine+2+%E2%86%92+%241%2C200&pf_client=42&pf_mba=BICAU002&pf_category=pacing",
  )
  assert.deepEqual(fromHref(href), {
    compose: "help",
    prefill: { title: "Pacing help", description: "Line 1\n\nLine 2 → $1,200", clientId: 42, mbaNumber: "BICAU002", category: "pacing" },
    notes: [],
  })

  const long = buildTasksComposeHref({ compose: "task", title: "t".repeat(900), description: "d".repeat(9000) })
  const back = fromHref(long)
  assert.equal(back.prefill.title!.length, COMPOSE_TITLE_MAX)
  assert.equal(back.prefill.description!.length, COMPOSE_DESCRIPTION_MAX)
  assert.deepEqual(back.notes, [])

  assert.equal(
    buildTasksComposeHref({ compose: "task", clientId: 0, mbaNumber: "bad/mba", category: "nope" as never }),
    "/tasks?compose=task",
  )
  assert.equal(buildTasksComposeHref({ compose: "task", clientId: null, mbaNumber: null, title: null }), "/tasks?compose=task")
})

test("tasksForMbaHref and withoutComposeParams", () => {
  assert.equal(tasksForMbaHref("BICAU002"), "/tasks?mba=BICAU002")
  assert.equal(tasksForMbaHref("  "), "/tasks")
  assert.equal(tasksForMbaHref("a&b"), "/tasks?mba=a%26b")
  assert.equal(
    withoutComposeParams("?compose=task&pf_title=x&view=list&pf_client=1&pf_mba=a&pf_desc=d&pf_category=pacing&mba=Z"),
    "view=list&mba=Z",
  )
  assert.equal(withoutComposeParams(""), "")
})
