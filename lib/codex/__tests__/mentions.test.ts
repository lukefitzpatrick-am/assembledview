import assert from "node:assert/strict"
import { test } from "node:test"

import {
  findMentionTokens,
  mentionSegments,
  readStoredMentions,
  resolveCommentMentions,
  unresolvedMentionMessage,
} from "../mentions"

const ROSTER = [
  { email: "ellie.ward@assembledmedia.com.au", name: "Ellie Ward" },
  { email: "mia.tran@assembledmedia.com.au", name: "Mia Tran", aliases: ["mia@assembledmedia.com.au"] },
  { email: "josh.patel@assembledmedia.com.au", name: "Josh Patel" },
  { email: "josh.plum@assembledmedia.com.au", name: "Josh Plumridge" },
  { email: "gone@assembledmedia.com.au", name: "Gone Person", active: false },
  { email: "sam@assembledmedia.com.au", name: "Sam Lee" },
  { email: "sam@otheragency.com.au", name: "Sam Ng" },
]

test("tokens: after a boundary only, trailing punctuation trimmed, emails whole", () => {
  assert.deepEqual(
    findMentionTokens("Hi @ellie, ask@mia not one. (@mia.tran) and @josh.patel@assembledmedia.com.au.").map((t) => t.token),
    ["@ellie", "@mia.tran", "@josh.patel@assembledmedia.com.au"],
  )
  assert.deepEqual(findMentionTokens("@ a @"), [])
  const [t] = findMentionTokens("x @ellie.")
  assert.equal(t!.start, 2)
  assert.equal(t!.end, 8)
})

test("resolve: unique by local part, name and email; one entry per person", () => {
  const r = resolveCommentMentions("@ellie.ward and @Ellie and @mia.tran@assembledmedia.com.au", ROSTER, { aliases: false })
  assert.deepEqual(r.mentions, [
    { email: "ellie.ward@assembledmedia.com.au", name: "Ellie Ward", token: "@ellie.ward" },
    { email: "mia.tran@assembledmedia.com.au", name: "Mia Tran", token: "@mia.tran@assembledmedia.com.au" },
  ])
  assert.deepEqual(r.unresolved, [])
})

test("ambiguous and unknown tokens stay text and are reported; inactive people never match", () => {
  const r = resolveCommentMentions("@sam and @josh can you and @nobody and @gone", ROSTER, { aliases: false })
  assert.deepEqual(r.mentions, [])
  assert.deepEqual(r.unresolved, [
    { token: "@sam", reason: "ambiguous", count: 2 },
    { token: "@josh", reason: "ambiguous", count: 2 },
    { token: "@nobody", reason: "unknown" },
    { token: "@gone", reason: "unknown" },
  ])
  assert.match(unresolvedMentionMessage(r.unresolved[0]!), /matches 2 people/)
  assert.match(unresolvedMentionMessage(r.unresolved[2]!), /not on the team list/)
})

test("aliases count only with the switch", () => {
  assert.equal(resolveCommentMentions("@mia@assembledmedia.com.au", ROSTER, { aliases: false }).mentions.length, 0)
  assert.deepEqual(resolveCommentMentions("@mia@assembledmedia.com.au", ROSTER, { aliases: true }).mentions.map((m) => m.email), [
    "mia.tran@assembledmedia.com.au",
  ])
})

test("private project: someone who cannot see it is not mentioned and the author is told", () => {
  const r = resolveCommentMentions("@ellie and @mia.tran", ROSTER, {
    aliases: false,
    canSee: (email) => email.startsWith("mia"),
  })
  assert.deepEqual(r.mentions.map((m) => m.email), ["mia.tran@assembledmedia.com.au"])
  assert.deepEqual(r.unresolved, [{ token: "@ellie", reason: "no_access", name: "Ellie Ward" }])
  assert.match(unresolvedMentionMessage(r.unresolved[0]!), /Ellie Ward cannot see this private project/)
})

test("segments: stored tokens are chips, everything else stays text", () => {
  const body = "Thanks @Ellie, and @nobody too."
  const segs = mentionSegments(body, [{ email: "ellie.ward@assembledmedia.com.au", name: "Ellie Ward", token: "@ellie" }])
  assert.deepEqual(segs, [
    { kind: "text", text: "Thanks " },
    { kind: "mention", text: "@Ellie", email: "ellie.ward@assembledmedia.com.au", name: "Ellie Ward" },
    { kind: "text", text: ", and @nobody too." },
  ])
  assert.equal(segs.map((s) => s.text).join(""), body)
  assert.deepEqual(mentionSegments("plain", []), [{ kind: "text", text: "plain" }])
})

test("stored mentions read defensively", () => {
  assert.deepEqual(readStoredMentions(null), [])
  assert.deepEqual(readStoredMentions([{ email: "X@Y.au", token: "@x" }, { email: "bad" }, 3]), [{ email: "x@y.au", name: "x@y.au", token: "@x" }])
})
