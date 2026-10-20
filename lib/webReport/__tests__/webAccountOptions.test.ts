import assert from "node:assert/strict"
import { test } from "node:test"

import { optionsFromRows } from "@/lib/webReport/builder/accounts"

test("account options mark accounts linked to another client", () => {
  const out = optionsFromRows(
    [
      { PLATFORM: "ga4", ACCOUNT_REF: "372647707", LABEL: "HartmannDirect AU GA4", LAST_DATA_DATE: null },
      { PLATFORM: "ga4", ACCOUNT_REF: "273526165", LABEL: "GA_archive.golf.org.au", LAST_DATA_DATE: null },
      { PLATFORM: "gsc", ACCOUNT_REF: "https://www.molicare.au/", LABEL: "https://www.molicare.au/", LAST_DATA_DATE: "2026-10-19" },
      { PLATFORM: "other", ACCOUNT_REF: "x", LABEL: "x", LAST_DATA_DATE: null },
    ],
    [
      { platform: "ga4", ref: "273526165", clientId: 19, clientName: "Golf Australia" },
      { platform: "ga4", ref: "372647707", clientId: 12, clientName: "Paul Hartmann Pty Ltd" },
    ],
    12,
  )
  assert.equal(out.ga4.length, 2)
  assert.equal(out.ga4.find((o) => o.ref === "372647707")?.linkedTo, null, "this client's own link is not 'elsewhere'")
  assert.equal(out.ga4.find((o) => o.ref === "273526165")?.linkedTo, "Golf Australia")
  assert.equal(out.gsc[0]?.lastDataDate, "2026-10-19")
})
