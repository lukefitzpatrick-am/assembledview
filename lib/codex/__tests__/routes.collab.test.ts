/**
 * B41 routes: followers, attachments (list, upload, link, fetch, delete), the
 * bell, mark read, the digest switch, comments with mentions and the daily
 * cron. The full guard chain on every method (codex_v2 404, own switch 404
 * with or without a session, no session 401, client 403, no email 401), 503
 * before 0118, 500 without detail, store refusals mapped, bad ids 404 and bad
 * bodies 400 before the store; attachment access control at the route.
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

let session: null | { user: { email?: string; roles: string[] } } = null
const calls: Array<{ fn: string; args: unknown[] }> = []
let mode = "ok"
let markerApplied = true
/** Only createAttachment refuses (after the file is in Blob). */
let createMode = "ok"
const blobs = { put: [] as string[], del: [] as string[] }

class ProjectsUnavailableError extends Error {
  readonly code = "PROJECTS_UNAVAILABLE"
}

const ATT = { id: 4, task_id: 7, kind: "blob", name: "a.pdf", url: null, host: null, size_bytes: 3, content_type: "application/pdf", uploaded_by_email: "luke@x.au", created_at: "t", can_delete: true }
const FOLLOWERS = { ok: true, followers: [{ email: "luke@x.au", name: "Luke", reason: "manual" }], following: true }

function outcome<T>(okValue: T): T | { ok: false; reason: string; message: string } {
  if (mode === "unavailable") throw new ProjectsUnavailableError("0118")
  if (mode === "boom") throw new Error("secret detail")
  if (mode !== "ok") return { ok: false, reason: mode, message: `m:${mode}` }
  return okValue
}
function plain<T>(value: T): T {
  if (mode === "unavailable") throw new ProjectsUnavailableError("0118")
  if (mode === "boom") throw new Error("secret detail")
  return value
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: async () => null } })
  const fn = (name: string, value: () => unknown) => async (...args: unknown[]) => {
    calls.push({ fn: name, args })
    return value()
  }
  await mock.module!("@/lib/codex/projectsRepo", { namedExports: { ProjectsUnavailableError } })
  await mock.module!("@/lib/codex/projectsMarker", { namedExports: { isProjectsMigrationApplied: async () => markerApplied } })
  await mock.module!("@/lib/codex/collabRepo", {
    namedExports: {
      listFollowers: fn("listFollowers", () => outcome(FOLLOWERS)),
      followTask: fn("followTask", () => outcome(FOLLOWERS)),
      unfollowTask: fn("unfollowTask", () => outcome({ ...FOLLOWERS, following: false })),
      listAttachments: fn("listAttachments", () => outcome({ ok: true, attachments: [ATT] })),
      checkCanAttach: fn("checkCanAttach", () => outcome({ ok: true })),
      createAttachment: fn("createAttachment", () => {
        if (createMode === "throw") throw new Error("row write failed")
        return createMode === "ok" ? outcome({ ok: true, attachment: ATT }) : { ok: false, reason: createMode, message: "m" }
      }),
      deleteAttachment: fn("deleteAttachment", () => outcome({ ok: true, blobPathname: "codex/tasks/7/a-x.pdf" })),
      getAttachmentFile: fn("getAttachmentFile", () => outcome({ ok: true, pathname: "codex/tasks/7/a-x.pdf", name: "a \"b\".pdf", contentType: "application/pdf" })),
      listCommentsWithMentions: fn("listCommentsWithMentions", () => outcome({ ok: true, items: [{ id: 1, mentions: [] }] })),
      createCommentWithMentions: fn("createCommentWithMentions", () =>
        outcome({ ok: true, comment: { id: 2, body: "hi", mentions: [] }, unresolved: [{ token: "@x", reason: "unknown" }], notified: 0 })
      ),
    },
  })
  await mock.module!("@/lib/codex/notificationsRepo", {
    namedExports: {
      BELL_LIMIT_DEFAULT: 30,
      listBell: fn("listBell", () => plain({ items: [], unread: 3, email_digest: true })),
      markNotificationsRead: fn("markNotificationsRead", () => plain(2)),
      setEmailDigest: fn("setEmailDigest", () => plain(false)),
      runDailyNotifications: fn("runDailyNotifications", () =>
        plain({ reminders: { due_tomorrow: 1, overdue: 0, tasks: 1 }, digest: { people: 1, sent: 1, failed: 0, quiet: 0, off: 0, notifications: 1 } })
      ),
    },
  })
  await mock.module!("@/lib/codex/attachmentBlob", {
    namedExports: {
      storeTaskAttachmentBlob: async (taskId: number, name: string) => {
        const p = `codex/tasks/${taskId}/${name}-rnd`
        blobs.put.push(p)
        return p
      },
      deleteTaskAttachmentBlob: async (p: string) => void blobs.del.push(p),
    },
  })
  await mock.module!("@/lib/creative/getPrivateBlob", {
    namedExports: {
      getPrivateBlob: async (p: string) => {
        calls.push({ fn: "getPrivateBlob", args: [p] })
        return { statusCode: 200, stream: new Blob(["PDF"]).stream(), blob: { contentType: "text/html" } }
      },
    },
  })
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      createComment: fn("createComment", () => ({ id: 9, body: "plain" })),
      listComments: fn("listComments", () => [{ id: 9, body: "plain" }]),
    },
  })
  await mock.module!("@/lib/codex/rosterRead", { namedExports: { loadRosterPeople: async () => [] } })
  await mock.module!("@/lib/email/sendHtmlEmail", { namedExports: { sendHtmlEmail: async () => undefined } })
  await mock.module!("@/lib/log", { namedExports: { logJob: () => undefined } })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withSwitches<T>(
  s: { codex?: boolean; projects?: boolean; notifications?: boolean; aliases?: boolean },
  run: () => Promise<T>
): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", s.codex ?? true)],
        ["codex_projects", row("codex_projects", s.projects ?? true)],
        ["codex_notifications", row("codex_notifications", s.notifications ?? true)],
        ["codex_roster_aliases", row("codex_roster_aliases", s.aliases ?? false)],
      ])
  )
  try {
    return await run()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const T = "http://l/api/codex/tasks"
const N = "http://l/api/codex/notifications"
const req = (method: string, url: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
function fileReq(url: string, files: Array<{ name: string; bytes: number }>): Request {
  const form = new FormData()
  for (const f of files) form.append("file", new File([new Uint8Array(f.bytes)], f.name))
  return new Request(url, { method: "POST", body: form })
}
const ctx = <Q extends Record<string, string>>(p: Q) => ({ params: Promise.resolve(p) })
const STAFF = { user: { email: "Luke@X.au", roles: ["admin"] } }

type Call = { name: string; run: () => Promise<Response>; repo: string; okStatus: number; gate: "projects" | "notifications" }

async function routes(): Promise<Call[]> {
  const followers = await import("../../../app/api/codex/tasks/[id]/followers/route.js")
  const attachments = await import("../../../app/api/codex/tasks/[id]/attachments/route.js")
  const attachment = await import("../../../app/api/codex/tasks/[id]/attachments/[attachmentId]/route.js")
  const bell = await import("../../../app/api/codex/notifications/route.js")
  const read = await import("../../../app/api/codex/notifications/read/route.js")
  const prefs = await import("../../../app/api/codex/notifications/prefs/route.js")
  return [
    { name: "GET followers", gate: "projects", repo: "listFollowers", okStatus: 200, run: () => followers.GET(req("GET", `${T}/7/followers`), ctx({ id: "7" })) },
    { name: "POST follow", gate: "projects", repo: "followTask", okStatus: 200, run: () => followers.POST(req("POST", `${T}/7/followers`, { email: "Ellie@X.au" }), ctx({ id: "7" })) },
    { name: "DELETE follow", gate: "projects", repo: "unfollowTask", okStatus: 200, run: () => followers.DELETE(req("DELETE", `${T}/7/followers`), ctx({ id: "7" })) },
    { name: "GET attachments", gate: "projects", repo: "listAttachments", okStatus: 200, run: () => attachments.GET(req("GET", `${T}/7/attachments`), ctx({ id: "7" })) },
    { name: "POST link", gate: "projects", repo: "createAttachment", okStatus: 201, run: () => attachments.POST(req("POST", `${T}/7/attachments`, { url: "https://x.com/a.pdf" }), ctx({ id: "7" })) },
    { name: "GET file", gate: "projects", repo: "getAttachmentFile", okStatus: 200, run: () => attachment.GET(req("GET", `${T}/7/attachments/4`), ctx({ id: "7", attachmentId: "4" })) },
    { name: "DELETE attachment", gate: "projects", repo: "deleteAttachment", okStatus: 200, run: () => attachment.DELETE(req("DELETE", `${T}/7/attachments/4`), ctx({ id: "7", attachmentId: "4" })) },
    { name: "GET bell", gate: "notifications", repo: "listBell", okStatus: 200, run: () => bell.GET(req("GET", `${N}?limit=10`)) },
    { name: "POST read", gate: "notifications", repo: "markNotificationsRead", okStatus: 200, run: () => read.POST(req("POST", `${N}/read`, { ids: [3, 4] })) },
    { name: "PUT prefs", gate: "notifications", repo: "setEmailDigest", okStatus: 200, run: () => prefs.PUT(req("PUT", `${N}/prefs`, { email_digest: false })) },
  ]
}

async function statuses(all: Call[]): Promise<number[]> {
  const out: number[] = []
  for (const c of all) out.push((await c.run()).status)
  return out
}

test("every method: codex_v2 off 404, its own switch off 404 (with or without a session), no session 401, client 403, no email 401", { skip }, async () => {
  const all = await routes()
  assert.equal(all.length, 10)
  calls.length = 0
  mode = "ok"
  for (const who of [STAFF, null, { user: { email: "c@client.com", roles: ["client"] } }]) {
    session = who
    assert.deepEqual(await withSwitches({ codex: false }, () => statuses(all)), all.map(() => 404), "codex_v2 off")
    assert.deepEqual(await withSwitches({ projects: false }, () => statuses(all)), all.map(() => 404), "codex_projects off (notifications needs it)")
    assert.deepEqual(
      await withSwitches({ notifications: false }, () => statuses(all)),
      all.map((c) => (c.gate === "notifications" ? 404 : who === STAFF ? c.okStatus : who === null ? 401 : 403)),
      "codex_notifications off: only the bell routes"
    )
  }
  calls.length = 0
  session = null
  assert.deepEqual(await withSwitches({}, () => statuses(all)), all.map(() => 401), "no session")
  session = { user: { email: "c@client.com", roles: ["client"] } }
  assert.deepEqual(await withSwitches({}, () => statuses(all)), all.map(() => 403), "client role")
  session = { user: { roles: ["admin"] } }
  assert.deepEqual(await withSwitches({}, () => statuses(all)), all.map(() => 401), "no email")
  assert.equal(calls.length, 0)
})

test("staff with the switches on: every method reaches its store with ids, the parsed body and the lower-case email", { skip }, async () => {
  const all = await routes()
  calls.length = 0
  blobs.del.length = 0
  mode = "ok"
  session = STAFF
  assert.deepEqual(await withSwitches({}, () => statuses(all)), all.map((c) => c.okStatus))
  const byFn = Object.fromEntries(calls.map((c) => [c.fn, c.args]))
  for (const c of all) assert.ok(byFn[c.repo], c.repo)
  assert.deepEqual(byFn.listFollowers, [7, "luke@x.au"])
  assert.deepEqual(byFn.followTask, [7, "luke@x.au", "ellie@x.au", { notify: true, aliases: false }])
  assert.deepEqual(byFn.unfollowTask, [7, "luke@x.au"])
  assert.deepEqual(byFn.listAttachments, [7, "luke@x.au", ["admin"]])
  assert.deepEqual(byFn.createAttachment, [7, "luke@x.au", ["admin"], { kind: "link", name: "a.pdf", url: "https://x.com/a.pdf" }, { notify: true }])
  assert.deepEqual(byFn.getAttachmentFile, [7, 4, "luke@x.au"])
  assert.deepEqual(byFn.deleteAttachment, [7, 4, "luke@x.au", ["admin"]])
  assert.deepEqual(byFn.listBell, ["luke@x.au", 10])
  assert.deepEqual(byFn.markNotificationsRead, ["luke@x.au", { ids: [3, 4] }])
  assert.deepEqual(byFn.setEmailDigest, ["luke@x.au", false])
  assert.deepEqual(blobs.del, ["codex/tasks/7/a-x.pdf"], "the deleted attachment's file goes from Blob")
  blobs.del.length = 0

  // The store resolves the address on the roster; aliases count only with codex_roster_aliases (F2).
  calls.length = 0
  const followers = await import("../../../app/api/codex/tasks/[id]/followers/route.js")
  const withAliases = await withSwitches({ aliases: true, notifications: false }, () =>
    followers.POST(req("POST", `${T}/7/followers`, {}), ctx({ id: "7" }))
  )
  assert.equal(withAliases.status, 200)
  assert.deepEqual(calls.at(-1)!.args, [7, "luke@x.au", null, { notify: false, aliases: true }])
})

test("before 0118 every method is 503 migration_not_applied; an unexpected error is 500 without the detail", { skip }, async () => {
  const all = await routes()
  session = STAFF
  for (const m of ["unavailable", "boom"]) {
    mode = m
    for (const c of all) {
      const res = await withSwitches({}, () => c.run())
      const body = (await res.json()) as { error: string; message?: string }
      if (m === "unavailable") {
        assert.equal(res.status, 503, c.name)
        assert.equal(body.error, "migration_not_applied", c.name)
      } else {
        assert.equal(res.status, 500, c.name)
        assert.doesNotMatch(JSON.stringify(body), /secret/, c.name)
      }
    }
  }
  mode = "ok"
})

test("store refusals map to statuses", { skip }, async () => {
  const all = (await routes()).filter((c) => c.gate === "projects")
  session = STAFF
  const cases: Array<[string, number]> = [
    ["task_not_found", 404],
    ["not_found", 404],
    ["follower_no_access", 409],
    ["not_uploader", 403],
    ["too_many_attachments", 409],
    ["not_on_roster", 400],
    ["ambiguous_address", 400],
  ]
  for (const [reason, status] of cases) {
    mode = reason
    for (const c of all) {
      const res = await withSwitches({}, () => c.run())
      assert.equal(res.status, status, `${c.name} ${reason}`)
      assert.equal(((await res.json()) as { error: string }).error, reason)
    }
  }
  mode = "ok"
})

test("bad ids are 404 and bad bodies 400, before the store", { skip }, async () => {
  const followers = await import("../../../app/api/codex/tasks/[id]/followers/route.js")
  const attachments = await import("../../../app/api/codex/tasks/[id]/attachments/route.js")
  const attachment = await import("../../../app/api/codex/tasks/[id]/attachments/[attachmentId]/route.js")
  const bell = await import("../../../app/api/codex/notifications/route.js")
  const read = await import("../../../app/api/codex/notifications/read/route.js")
  const prefs = await import("../../../app/api/codex/notifications/prefs/route.js")
  session = STAFF
  mode = "ok"
  calls.length = 0
  const got = await withSwitches({}, async () => [
    (await followers.GET(req("GET", `${T}/x/followers`), ctx({ id: "x" }))).status,
    (await attachment.GET(req("GET", `${T}/7/attachments/0`), ctx({ id: "7", attachmentId: "0" }))).status,
    (await attachment.DELETE(req("DELETE", `${T}/-1/attachments/4`), ctx({ id: "-1", attachmentId: "4" }))).status,
    (await followers.POST(req("POST", `${T}/7/followers`, { email: "not an email" }), ctx({ id: "7" }))).status,
    (await followers.POST(req("POST", `${T}/7/followers`, [1]), ctx({ id: "7" }))).status,
    (await attachments.POST(req("POST", `${T}/7/attachments`, { url: "javascript:alert(1)" }), ctx({ id: "7" }))).status,
    (await attachments.POST(req("POST", `${T}/7/attachments`, { name: "x" }), ctx({ id: "7" }))).status,
    (await bell.GET(req("GET", `${N}?limit=0`))).status,
    (await bell.GET(req("GET", `${N}?limit=abc`))).status,
    (await read.POST(req("POST", `${N}/read`, { ids: [] }))).status,
    (await read.POST(req("POST", `${N}/read`, { ids: ["x"] }))).status,
    (await read.POST(req("POST", `${N}/read`, { all: true, ids: [1] }))).status,
    (await read.POST(req("POST", `${N}/read`, { ids: Array.from({ length: 201 }, (_, i) => i + 1) }))).status,
    (await prefs.PUT(req("PUT", `${N}/prefs`, { email_digest: "no" }))).status,
  ])
  assert.deepEqual(got, [404, 404, 404, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400])
  assert.equal(calls.length, 0)
  const all = await withSwitches({}, () => read.POST(req("POST", `${N}/read`, { all: true })))
  assert.equal(all.status, 200)
  assert.deepEqual(calls.at(-1)!.args, ["luke@x.au", { all: true }])
})

test("upload: one file, type and size checked before Blob, visibility and count before Blob, file removed when the store refuses", { skip }, async () => {
  const attachments = await import("../../../app/api/codex/tasks/[id]/attachments/route.js")
  session = STAFF
  mode = "ok"
  calls.length = 0
  blobs.put.length = 0
  blobs.del.length = 0
  const post = (files: Array<{ name: string; bytes: number }>) =>
    withSwitches({}, () => attachments.POST(fileReq(`${T}/7/attachments`, files), ctx({ id: "7" })))
  assert.equal((await post([{ name: "evil.svg", bytes: 10 }])).status, 415)
  assert.equal((await post([{ name: "big.pdf", bytes: 4 * 1024 * 1024 + 1 }])).status, 413)
  assert.equal((await post([{ name: "a.pdf", bytes: 3 }, { name: "b.pdf", bytes: 3 }])).status, 400)
  assert.equal((await post([])).status, 400)
  assert.deepEqual(blobs.put, [], "nothing reaches Blob")
  const ok = await post([{ name: "proof.pdf", bytes: 3 }])
  assert.equal(ok.status, 201)
  assert.deepEqual(blobs.put, ["codex/tasks/7/proof.pdf-rnd"])
  const created = calls.find((c) => c.fn === "createAttachment")!
  assert.deepEqual(created.args.slice(0, 4), [7, "luke@x.au", ["admin"], { kind: "blob", name: "proof.pdf", blobPathname: "codex/tasks/7/proof.pdf-rnd", sizeBytes: 3 }])
  assert.ok(calls.findIndex((c) => c.fn === "checkCanAttach") < calls.findIndex((c) => c.fn === "createAttachment"))

  // The store refuses after the file is stored (the count filled up meanwhile): the file is removed.
  blobs.put.length = 0
  createMode = "too_many_attachments"
  assert.equal((await post([{ name: "late.pdf", bytes: 3 }])).status, 409)
  assert.deepEqual(blobs.del, ["codex/tasks/7/late.pdf-rnd"])
  createMode = "ok"
  blobs.del.length = 0

  // The row write throws after the file is stored: the file is removed and the answer is a plain 500 (A13).
  blobs.put.length = 0
  createMode = "throw"
  const thrown = await post([{ name: "boom.pdf", bytes: 3 }])
  assert.equal(thrown.status, 500)
  assert.doesNotMatch(await thrown.text(), /row write failed/)
  assert.deepEqual(blobs.del, ["codex/tasks/7/boom.pdf-rnd"])
  createMode = "ok"
  blobs.del.length = 0

  // A task you cannot see: refused before the file goes to Blob.
  blobs.put.length = 0
  mode = "task_not_found"
  assert.equal((await post([{ name: "proof.pdf", bytes: 3 }])).status, 404)
  assert.deepEqual(blobs.put, [])
  mode = "ok"
})

test("download: the store's type and a download disposition, never the blob's; refused before Blob for someone who cannot see the task", { skip }, async () => {
  const attachment = await import("../../../app/api/codex/tasks/[id]/attachments/[attachmentId]/route.js")
  session = STAFF
  mode = "ok"
  calls.length = 0
  const res = await withSwitches({}, () => attachment.GET(req("GET", `${T}/7/attachments/4`), ctx({ id: "7", attachmentId: "4" })))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("content-type"), "application/pdf")
  assert.match(res.headers.get("content-disposition")!, /^attachment; filename="a _b_.pdf"/)
  assert.equal(res.headers.get("x-content-type-options"), "nosniff")
  assert.match(res.headers.get("cache-control")!, /no-store/)
  assert.equal(await res.text(), "PDF")
  assert.deepEqual(calls.find((c) => c.fn === "getPrivateBlob")!.args, ["codex/tasks/7/a-x.pdf"])

  calls.length = 0
  mode = "task_not_found"
  const denied = await withSwitches({}, () => attachment.GET(req("GET", `${T}/7/attachments/4`), ctx({ id: "7", attachmentId: "4" })))
  assert.equal(denied.status, 404)
  assert.equal(calls.some((c) => c.fn === "getPrivateBlob"), false)
  mode = "ok"
})

test("comments: with codex_projects on the mention store is used and a client-sent mentions key is ignored; off or before 0118 as before", { skip }, async () => {
  const comments = await import("../../../app/api/codex/tasks/[id]/comments/route.js")
  session = STAFF
  mode = "ok"
  calls.length = 0
  const res = await withSwitches({ notifications: false }, () =>
    comments.POST(req("POST", `${T}/7/comments`, { body: " hi @x ", mentions: [{ email: "boss@x.au" }] }), ctx({ id: "7" }))
  )
  assert.equal(res.status, 201)
  const body = (await res.json()) as { id: number; unresolved_mentions: Array<{ token: string; message: string }> }
  assert.equal(body.id, 2)
  assert.equal(body.unresolved_mentions[0]!.token, "@x")
  assert.match(body.unresolved_mentions[0]!.message, /not on the team list/)
  const call = calls.find((c) => c.fn === "createCommentWithMentions")!
  const input = call.args[1] as Record<string, unknown>
  assert.equal(call.args[0], 7)
  assert.equal(input.body, "hi @x")
  assert.equal(input.authorEmail, "luke@x.au")
  assert.equal(input.notify, false)
  assert.equal("mentions" in input, false)

  calls.length = 0
  const off = await withSwitches({ projects: false }, () => comments.POST(req("POST", `${T}/7/comments`, { body: "hi @x" }), ctx({ id: "7" })))
  assert.equal(off.status, 201)
  await withSwitches({ projects: false }, () => comments.GET(req("GET", `${T}/7/comments`), ctx({ id: "7" })))
  assert.deepEqual(calls.map((c) => c.fn), ["createComment", "listComments"], "switch off: the plain store, no mentions")
  mode = "unavailable"
  calls.length = 0
  const before0118 = await withSwitches({}, () => comments.POST(req("POST", `${T}/7/comments`, { body: "hi" }), ctx({ id: "7" })))
  assert.equal(before0118.status, 201)
  await withSwitches({}, () => comments.GET(req("GET", `${T}/7/comments`), ctx({ id: "7" })))
  assert.deepEqual(calls.map((c) => c.fn), ["createCommentWithMentions", "createComment", "listCommentsWithMentions", "listComments"], "before 0118: as before")
  mode = "ok"

  calls.length = 0
  const listed = await withSwitches({}, () => comments.GET(req("GET", `${T}/7/comments`), ctx({ id: "7" })))
  assert.equal(listed.status, 200)
  assert.deepEqual(calls.map((c) => c.fn), ["listCommentsWithMentions"])

  mode = "task_not_found"
  const hidden = await withSwitches({}, () => comments.GET(req("GET", `${T}/7/comments`), ctx({ id: "7" })))
  assert.equal(hidden.status, 404)
  const hiddenPost = await withSwitches({}, () => comments.POST(req("POST", `${T}/7/comments`, { body: "x" }), ctx({ id: "7" })))
  assert.equal(hiddenPost.status, 404)
  mode = "ok"
})

test("cron: secret required; off, wrong hour or before 0118 skipped; the Melbourne 08:00 run makes reminders then the digest", { skip }, async () => {
  const cron = await import("../../../app/api/cron/codex-notifications/route.js")
  process.env.CRON_SECRET = "s3"
  const run = (now: string, secret = "s3") =>
    cron.GET(new Request(`http://l/api/cron/codex-notifications?now=${encodeURIComponent(now)}`, { headers: { authorization: `Bearer ${secret}` } }))
  mode = "ok"
  assert.equal((await withSwitches({}, () => run("2026-11-12T21:30:00Z", "nope"))).status, 401)
  calls.length = 0
  const off = await withSwitches({ notifications: false }, () => run("2026-11-12T21:30:00Z"))
  assert.equal(((await off.json()) as { reason: string }).reason, "switch_off")
  const offProjects = await withSwitches({ projects: false }, () => run("2026-11-12T21:30:00Z"))
  assert.equal(((await offProjects.json()) as { reason: string }).reason, "switch_off")
  const late = await withSwitches({}, () => run("2026-11-12T22:30:00Z"))
  assert.equal(((await late.json()) as { reason: string }).reason, "not_melbourne_0800_hour")
  markerApplied = false
  const before0118 = await withSwitches({}, () => run("2026-11-12T21:30:00Z"))
  assert.equal(((await before0118.json()) as { reason: string }).reason, "migration_not_applied")
  markerApplied = true
  assert.equal(calls.length, 0)
  const ok = await withSwitches({}, () => run("2026-06-15T22:30:00Z"))
  assert.equal(ok.status, 200)
  assert.deepEqual(calls.map((c) => c.fn), ["runDailyNotifications"], "reminders and digest in one call, in that order (pinned on Postgres)")
  assert.equal((calls[0]!.args[0] as Date).toISOString(), "2026-06-15T22:30:00.000Z")
  const okBody = (await ok.json()) as { reminders: { due_tomorrow: number }; digest: { sent: number } }
  assert.equal(okBody.reminders.due_tomorrow, 1)
  assert.equal(okBody.digest.sent, 1)
  mode = "boom"
  const failed = await withSwitches({}, () => run("2026-06-15T22:30:00Z"))
  assert.equal(failed.status, 500)
  mode = "ok"
  delete process.env.CRON_SECRET
})
