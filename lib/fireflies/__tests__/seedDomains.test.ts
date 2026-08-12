import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  collectSeedDomainPairs,
  domainFromWebsite,
  seedableDomainsFromClient,
} from "../seedDomains.js"

describe("seedableDomainsFromClient", () => {
  it("extracts domains from keyemail, billingemail, website", () => {
    const domains = seedableDomainsFromClient(
      {
        id: 1,
        keyemail: "Jane@Acme.com.au",
        billingemail: "ap@acme.com.au",
        website: "https://www.acme.com.au/about",
      },
      new Set(["assembledmedia.com.au"])
    )
    assert.deepEqual(domains, ["acme.com.au"])
  })

  it("skips assembled contact emails", () => {
    const domains = seedableDomainsFromClient(
      {
        id: 2,
        keyemail: "luke@assembledmedia.com.au",
        billingemail: null,
        website: null,
      },
      new Set(["assembledmedia.com.au"])
    )
    assert.deepEqual(domains, [])
  })

  it("domainFromWebsite strips www", () => {
    assert.equal(domainFromWebsite("www.Client.io"), "client.io")
  })

  it("collectSeedDomainPairs is idempotent per client+domain", () => {
    const pairs = collectSeedDomainPairs(
      [
        {
          id: 1,
          keyemail: "a@acme.com",
          billingemail: "b@acme.com",
          website: "acme.com",
        },
      ],
      new Set()
    )
    assert.equal(pairs.length, 1)
    assert.deepEqual(pairs[0], { clientId: 1, emailDomain: "acme.com" })
  })
})
