import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { rosterEmailsNeverLoggedIn } from "../rosterLoginCheck.js"

describe("rosterEmailsNeverLoggedIn", () => {
  it("lists active roster emails with no Auth0 last_login", () => {
    const flagged = rosterEmailsNeverLoggedIn(
      [
        { email: "chelsea.schultz@assembledmedia.com.au", active: true },
        { email: "luke.fitzpatrick@assembledmedia.com.au", active: true },
        { email: "ex@assembledmedia.com.au", active: false },
      ],
      [
        {
          email: "luke.fitzpatrick@assembledmedia.com.au",
          last_login: "2026-08-01T00:00:00.000Z",
        },
        { email: "chelsea.schultz@assembledmedia.com.au", last_login: null },
      ]
    )
    assert.deepEqual(flagged, ["chelsea.schultz@assembledmedia.com.au"])
  })

  it("flags a roster email that has never appeared in Auth0", () => {
    const flagged = rosterEmailsNeverLoggedIn(
      [{ email: "new@assembledmedia.com.au", active: true }],
      []
    )
    assert.deepEqual(flagged, ["new@assembledmedia.com.au"])
  })
})
