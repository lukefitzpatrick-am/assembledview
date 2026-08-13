import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isLearnableExternalDomain } from "../learnableDomains.js"

const ASSEMBLED = new Set(["assembledmedia.com.au"])
const CLIENT_DOMAINS = new Set(["acme.com"])

describe("isLearnableExternalDomain", () => {
  it("rejects free-mail domains", () => {
    assert.equal(
      isLearnableExternalDomain("gmail.com", {
        assembledDomains: ASSEMBLED,
        clientDomains: CLIENT_DOMAINS,
      }),
      false
    )
    assert.equal(
      isLearnableExternalDomain("outlook.com", {
        assembledDomains: ASSEMBLED,
      }),
      false
    )
  })

  it("rejects roster / assembled domains", () => {
    assert.equal(
      isLearnableExternalDomain("assembledmedia.com.au", {
        assembledDomains: ASSEMBLED,
      }),
      false
    )
  })

  it("rejects domains already mapped to a client when asked", () => {
    assert.equal(
      isLearnableExternalDomain("acme.com", {
        assembledDomains: ASSEMBLED,
        clientDomains: CLIENT_DOMAINS,
      }),
      false
    )
  })

  it("allows a publisher/client company domain", () => {
    assert.equal(
      isLearnableExternalDomain("nine.com.au", {
        assembledDomains: ASSEMBLED,
        clientDomains: CLIENT_DOMAINS,
      }),
      true
    )
  })
})
