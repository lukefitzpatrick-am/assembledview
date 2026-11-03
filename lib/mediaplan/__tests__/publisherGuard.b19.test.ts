/**
 * B19 publisher guard (decision Q4): block typed names not in Publishers and
 * production lines with no publisher, warn on media lines with no publisher,
 * publish only, switch off = no change.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LINE_CHANNELS } from "@/db/schema/lineChannelValues"
import * as expert from "@/lib/mediaplan/expertGridChannelConfig"
import {
  PUBLISHER_FIELD_BY_CHANNEL,
  PUBLISHER_FLAG_BY_CHANNEL,
  PUBLISHER_NOT_IN_PUBLISHERS,
  clearResolvedPublisherFindings,
  evaluatePublisherGuard,
  formatPublisherGuardMessage,
  linePublisherValue,
  missingPublisherShortcuts,
  publisherGuardBuilderIssues,
  publisherGuardGateResult,
  shouldRunPublisherGuard,
  type PublisherGuardLine,
} from "@/lib/mediaplan/publisherGuard"

const PUBLISHERS = [
  { id: 11, publisher_name: "Nine", publisherid: "nine" },
  { id: 22, publisher_name: "Linkby", publisherid: "linkby" },
  { id: 37, publisher_name: "LinkedIn", publisherid: "link" },
  { id: 41, publisher_name: "Are Media", publisherid: "aremed" },
  { id: 12, publisher_name: "Southern Cross Austereo", publisherid: "sca1" },
  { id: 30, publisher_name: "Meta", publisherid: "meta" },
]

function line(over: Partial<PublisherGuardLine> & { channel: string }): PublisherGuardLine {
  return { lineItemId: `${over.channel.toUpperCase()}001`, ...over }
}

describe("publisher field per channel", () => {
  const configs: Record<string, { publisherField: string; descriptorCore: ReadonlyArray<{ key: string; kind?: string }> }> = {
    television: expert.TELEVISION_EXPERT_CHANNEL_CONFIG,
    radio: expert.RADIO_EXPERT_CHANNEL_CONFIG,
    cinema: expert.CINEMA_EXPERT_CHANNEL_CONFIG,
    newspaper: expert.NEWSPAPER_EXPERT_CHANNEL_CONFIG,
    magazines: expert.MAGAZINES_EXPERT_CHANNEL_CONFIG,
    ooh: expert.OOH_EXPERT_CHANNEL_CONFIG,
    prog_display: expert.PROGDISPLAY_EXPERT_CHANNEL_CONFIG,
    prog_video: expert.PROGVIDEO_EXPERT_CHANNEL_CONFIG,
    prog_audio: expert.PROGAUDIO_EXPERT_CHANNEL_CONFIG,
    prog_bvod: expert.PROGBVOD_EXPERT_CHANNEL_CONFIG,
    prog_ooh: expert.PROGOOH_EXPERT_CHANNEL_CONFIG,
    digi_display: expert.DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG,
    digi_video: expert.DIGIVIDEO_EXPERT_CHANNEL_CONFIG,
    digi_audio: expert.DIGIAUDIO_EXPERT_CHANNEL_CONFIG,
    digi_bvod: expert.BVOD_EXPERT_CHANNEL_CONFIG,
    social: expert.SOCIALMEDIA_EXPERT_CHANNEL_CONFIG,
    search: expert.SEARCH_EXPERT_CHANNEL_CONFIG,
    influencers: expert.INFLUENCERS_EXPERT_CHANNEL_CONFIG,
    integrations: expert.INTEGRATION_EXPERT_CHANNEL_CONFIG,
    production: expert.PRODUCTION_EXPERT_CHANNEL_CONFIG,
  }

  for (const channel of LINE_CHANNELS) {
    it(`${channel}: the guard reads the field the publisher picker writes`, () => {
      const cfg = configs[channel]
      assert.ok(cfg, `no expert config mapped for ${channel}`)
      const pickerKeys = cfg.descriptorCore
        .filter((d) => d.kind === "combobox-publishers")
        .map((d) => d.key)
      assert.deepEqual(pickerKeys, [PUBLISHER_FIELD_BY_CHANNEL[channel]])
      assert.equal(cfg.publisherField, PUBLISHER_FIELD_BY_CHANNEL[channel])
    })
  }

  it("network is read from attrs; digital falls back to platform", () => {
    assert.equal(linePublisherValue(line({ channel: "television", attrs: { network: " Nine " } })), "Nine")
    assert.equal(linePublisherValue(line({ channel: "television", publisher: "Nine" })), "")
    assert.equal(linePublisherValue(line({ channel: "digi_display", platform: "Nine" })), "Nine")
    assert.equal(linePublisherValue(line({ channel: "digi_display", publisher: "Are Media", platform: "Nine" })), "Are Media")
    assert.equal(linePublisherValue(line({ channel: "production", platform: "Nine" })), "")
    assert.equal(linePublisherValue(line({ channel: "social", platform: "Meta", publisher: "x" })), "Meta")
  })

  it("every channel with a picker flag maps to a publishers column", () => {
    for (const channel of LINE_CHANNELS) {
      const flag = PUBLISHER_FLAG_BY_CHANNEL[channel]
      if (channel === "production") assert.equal(flag, null)
      else assert.match(String(flag), /^pub_[a-z]+$/)
    }
  })
})

describe("evaluatePublisherGuard", () => {
  it("passes names in Publishers, ignoring case and spaces", () => {
    const r = evaluatePublisherGuard(
      [
        line({ channel: "digi_display", publisher: "  are MEDIA " }),
        line({ channel: "television", attrs: { network: "nine" } }),
        line({ channel: "production", publisher: "Nine" }),
      ],
      PUBLISHERS,
    )
    assert.deepEqual(r, { blocked: [], warnings: [] })
  })

  it("passes an approved alias and a unique publisherid", () => {
    const r = evaluatePublisherGuard(
      [
        line({ channel: "production", publisher: "SCA" }),
        line({ channel: "digi_display", publisher: "aremed" }),
        line({ channel: "prog_display", platform: "linkby" }),
      ],
      PUBLISHERS,
    )
    assert.deepEqual(r.blocked, [])
  })

  it("blocks a typed name that isn't in Publishers, on a media line", () => {
    const r = evaluatePublisherGuard([line({ channel: "prog_display", platform: "Linkyby" })], PUBLISHERS)
    assert.equal(r.blocked.length, 1)
    assert.equal(r.blocked[0].kind, "unknown")
    assert.equal(r.blocked[0].value, "Linkyby")
    assert.equal(r.blocked[0].field, "platform")
    assert.match(r.blocked[0].message, /"Linkyby" isn't in Publishers \(Programmatic Display line PROG_DISPLAY001\)/)
    assert.deepEqual(r.warnings, [])
  })

  it("blocks a production line with an unknown publisher and one with none", () => {
    const r = evaluatePublisherGuard(
      [
        line({ channel: "production", lineItemId: "P1", publisher: "Newscorp" }),
        line({ channel: "production", lineItemId: "P2", publisher: "  " }),
        line({ channel: "production", lineItemId: "P3", publisher: null }),
      ],
      PUBLISHERS,
    )
    assert.deepEqual(
      r.blocked.map((f) => [f.lineItemId, f.kind]),
      [
        ["P1", "unknown"],
        ["P2", "production_blank"],
        ["P3", "production_blank"],
      ],
    )
    assert.deepEqual(r.warnings, [])
  })

  it("warns, never blocks, a media line with no publisher", () => {
    const r = evaluatePublisherGuard(
      [
        line({ channel: "radio", lineItemId: "R1", attrs: { station: "3AW" } }),
        line({ channel: "ooh", lineItemId: "O1", attrs: null }),
      ],
      PUBLISHERS,
    )
    assert.deepEqual(r.blocked, [])
    assert.deepEqual(r.warnings.map((f) => [f.lineItemId, f.kind]), [
      ["R1", "media_blank"],
      ["O1", "media_blank"],
    ])
    assert.match(r.warnings[0].message, /Radio line R1 has no publisher\. It still saves\./)
  })

  it("an empty publisher list checks nothing (the list failed to load)", () => {
    const r = evaluatePublisherGuard([line({ channel: "production", publisher: "" })], [])
    assert.deepEqual(r, { blocked: [], warnings: [] })
  })

  it("skips a channel it doesn't know", () => {
    const r = evaluatePublisherGuard([line({ channel: "fax", publisher: "nobody" })], PUBLISHERS)
    assert.deepEqual(r, { blocked: [], warnings: [] })
  })
})

describe("publisherGuardGateResult", () => {
  const lines = [
    line({ channel: "digi_video", lineItemId: "DV1", publisher: "Broadsheet Media" }),
    line({ channel: "search", lineItemId: "S1", platform: "" }),
  ]

  it("switch off: no reject and no warnings, whatever the lines say", () => {
    assert.deepEqual(
      publisherGuardGateResult({ mode: "publish", enabled: false, lineItems: lines, publishers: PUBLISHERS }),
      { reject: false, warnings: [] },
    )
  })

  it("draft and new_version are never checked", () => {
    for (const mode of ["draft", "new_version"] as const) {
      assert.equal(shouldRunPublisherGuard(mode, true), false)
      assert.deepEqual(
        publisherGuardGateResult({ mode, enabled: true, lineItems: lines, publishers: PUBLISHERS }),
        { reject: false, warnings: [] },
      )
    }
  })

  it("publish with the switch on rejects with the code, ids and issues", () => {
    const r = publisherGuardGateResult({ mode: "publish", enabled: true, lineItems: lines, publishers: PUBLISHERS })
    assert.equal(r.reject, true)
    if (!r.reject) return
    assert.equal(r.body.code, PUBLISHER_NOT_IN_PUBLISHERS)
    assert.deepEqual(r.body.lineItemIds, ["DV1"])
    assert.equal(r.body.publisherIssues.length, 1)
    assert.match(r.body.error, /not in Publishers: "Broadsheet Media" \(DV1\)/)
  })

  it("publish with only blank media lines passes and returns the warnings", () => {
    const r = publisherGuardGateResult({
      mode: "publish",
      enabled: true,
      lineItems: [lines[1]],
      publishers: PUBLISHERS,
    })
    assert.equal(r.reject, false)
    if (r.reject) return
    assert.deepEqual(r.warnings.map((f) => f.lineItemId), ["S1"])
  })
})

describe("messages, issues and the Add to Publishers shortcut", () => {
  const blocked = evaluatePublisherGuard(
    [
      line({ channel: "digi_display", lineItemId: "DD1", publisher: "Broadsheet Media" }),
      line({ channel: "digi_video", lineItemId: "DV1", publisher: "broadsheet media " }),
      line({ channel: "production", lineItemId: "P1", publisher: "" }),
      line({ channel: "production", lineItemId: "P2", publisher: "API Charge" }),
    ],
    PUBLISHERS,
  ).blocked

  it("formats both kinds", () => {
    const msg = formatPublisherGuardMessage(blocked)
    assert.match(msg, /^Pick a publisher from Publishers to publish\. not in Publishers: /)
    assert.match(msg, /production lines with no publisher: P1/)
  })

  it("builder issues: blocked as errors, warnings as warnings", () => {
    const warnings = evaluatePublisherGuard([line({ channel: "search", lineItemId: "S1" })], PUBLISHERS).warnings
    const issues = publisherGuardBuilderIssues(blocked, warnings)
    assert.equal(issues.filter((i) => i.severity === "error").length, 4)
    assert.deepEqual(
      issues.filter((i) => i.severity === "warning").map((i) => i.id),
      ["publisher-guard:media_blank:S1"],
    )
    assert.equal(new Set(issues.map((i) => i.id)).size, issues.length)
  })

  it("one shortcut per typed name, with the channel flags to tick; none for blanks", () => {
    assert.deepEqual(missingPublisherShortcuts(blocked), [
      { name: "Broadsheet Media", flags: ["pub_digidisplay", "pub_digivideo"] },
      { name: "API Charge", flags: [] },
    ])
  })

  it("a newly added publisher clears its findings and nothing else", () => {
    const after = clearResolvedPublisherFindings(blocked, [
      ...PUBLISHERS,
      { id: 99, publisher_name: "Broadsheet Media", publisherid: "bsm" },
    ])
    assert.deepEqual(after.map((f) => f.lineItemId), ["P1", "P2"])
  })
})
