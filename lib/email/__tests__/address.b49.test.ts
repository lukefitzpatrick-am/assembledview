/** B49: one normaliseEmail and one displayNameFromEmail. The copies they replaced are kept verbatim below. */
import assert from "node:assert/strict"
import test from "node:test"

import { displayNameFromEmail, normaliseEmail } from "../address"

function oldCodexDisplay(email: string | null | undefined): string {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()
  const localPart = (e: string) => {
    const at = e.indexOf("@")
    return at > 0 ? e.slice(0, at) : ""
  }
  const local = localPart(norm(email)) || norm(email)
  return local.split(/[._+-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}
function oldFirefliesDisplay(email: string): string {
  const local = (email.split("@")[0] ?? "").trim()
  if (!local) return ""
  return local.split(/[._+\-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

const ADDRESSES = ["Mia.Wong@X.au", " chelsea.schultz@assembledmedia.com.au ", "luke@assembledmedia.com.au", "a_b-c+d@x", "SK", "Chelsea", "samantha@assembledmedia.com.au", "", "x..y@z"]

test("normaliseEmail is the trimmed lower-case form every copy used, with null and undefined as empty", () => {
  for (const a of ADDRESSES) assert.equal(normaliseEmail(a), a.trim().toLowerCase())
  assert.equal(normaliseEmail(null), "")
  assert.equal(normaliseEmail(undefined), "")
})

test("displayNameFromEmail matches the Codex copy everywhere and the Fireflies copy on every address with a local part", () => {
  for (const a of ADDRESSES) {
    assert.equal(displayNameFromEmail(a), oldCodexDisplay(a), a)
    assert.equal(displayNameFromEmail(a), oldFirefliesDisplay(a), a)
  }
  assert.equal(displayNameFromEmail(null), "")
  // The one shape the two copies disagreed on: no local part. The Codex rule wins.
  assert.equal(displayNameFromEmail("@x.au"), oldCodexDisplay("@x.au"))
})
