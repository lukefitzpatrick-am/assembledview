import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { ADMIN_PUBLISHER_PROFILES_REDIRECT } from "../publisherProfilesRedirect"

test("retired admin publisher-profiles page redirects to the Publisher Hub", () => {
  assert.equal(ADMIN_PUBLISHER_PROFILES_REDIRECT, "/publishers")
  const page = readFileSync(
    path.join(
      process.cwd(),
      "app/admin/publisher-profiles/page.tsx",
    ),
    "utf8",
  )
  assert.match(page, /ADMIN_PUBLISHER_PROFILES_REDIRECT/)
  assert.match(page, /redirect\(/)
  assert.doesNotMatch(page, /PublisherProfilesPageInner/)
})
