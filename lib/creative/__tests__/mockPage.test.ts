import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isPrivateOrReservedIp } from "@/lib/creative/mockPage/privateIp"

describe("isPrivateOrReservedIp", () => {
  it("rejects RFC1918 and loopback IPv4", () => {
    assert.equal(isPrivateOrReservedIp("10.0.0.1"), true)
    assert.equal(isPrivateOrReservedIp("172.16.5.1"), true)
    assert.equal(isPrivateOrReservedIp("172.31.255.255"), true)
    assert.equal(isPrivateOrReservedIp("192.168.1.1"), true)
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true)
    assert.equal(isPrivateOrReservedIp("169.254.10.1"), true)
  })

  it("allows public IPv4", () => {
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false)
    assert.equal(isPrivateOrReservedIp("1.1.1.1"), false)
    assert.equal(isPrivateOrReservedIp("172.32.0.1"), false)
  })

  it("rejects loopback and ULA IPv6", () => {
    assert.equal(isPrivateOrReservedIp("::1"), true)
    assert.equal(isPrivateOrReservedIp("fc00::1"), true)
    assert.equal(isPrivateOrReservedIp("fd12:3456::1"), true)
  })
})
