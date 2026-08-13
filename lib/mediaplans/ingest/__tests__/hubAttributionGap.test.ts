/**
 * C-50 characterisation: radio/OOH getScheduleHeaders still omit line.publisher
 * from header1. Hub spend now joins via lineItemMatchesPublisher (empty header1
 * falls through; short stamps use publisher_profiles.publisher_id).
 */
import assert from "node:assert/strict"
import test from "node:test"
import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"
import { lineItemMatchesPublisher } from "@/lib/api/dashboard/lineItemMatchesPublisher"

const QMS = { id: 30, publisher_name: "QMS", publisherid: "QMS" }
const SCA = {
  id: 12,
  publisher_name: "Southern Cross Austereo",
  publisherid: "sca",
}
const SEN = {
  id: 19,
  publisher_name: "Sports Entertainment Network",
  publisherid: "SEN",
}

test("radio/OOH schedule header1 ignores line publisher — Hub spend still attributes via publisher stamp", () => {
  const senLine = { publisher: "SEN", network: null, platform: null, station: "SEN 1170" }
  const scaLine = { publisher: "SCA", network: null, platform: null, station: "Triple M" }
  const qmsLine = { publisher: "QMS", network: null, format: "ESB" }

  const senH = getScheduleHeaders("radio", senLine)
  const scaH = getScheduleHeaders("radio", scaLine)
  const qmsH = getScheduleHeaders("ooh", qmsLine)

  assert.equal(senH.header1, "")
  assert.equal(scaH.header1, "")
  assert.equal(qmsH.header1, "")

  assert.equal(
    lineItemMatchesPublisher({ header1: senH.header1, publisher: "SEN" }, SEN),
    true,
  )
  assert.equal(
    lineItemMatchesPublisher({ header1: scaH.header1, publisher: "SCA" }, SCA),
    true,
  )
  assert.equal(
    lineItemMatchesPublisher({ header1: qmsH.header1, publisher: "QMS" }, QMS),
    true,
  )
})
