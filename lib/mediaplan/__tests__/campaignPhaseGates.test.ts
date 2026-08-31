/**
 * CS-C — each "active" gate reads publication or phase, not ad-hoc status strings.
 * Matrix: six persisted statuses × before / in-range / after campaign dates.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import { isApprovedOrBeyond, DOWNLOAD_BLOCKED_MESSAGE } from "@/lib/docs/isApprovedOrBeyond"
import {
  campaignPickerPriorityRank,
  isLiveOrCompletedPhase,
  resolveCampaignPhase,
  sydneyCivilDayFromYmd,
} from "@/lib/mediaplan/campaignPhase"
import {
  isVersionPublished,
  unpublishedDocumentError,
} from "@/lib/mediaplan/versionPublication"
import { isLiveCampaignStatus } from "@/lib/types/mediaPlanMaster"

const START = "2026-03-10"
const END = "2026-03-20"
const STATUSES = [
  "draft",
  "planned",
  "approved",
  "booked",
  "completed",
  "cancelled",
] as const
const POSITIONS = {
  before: "2026-03-01",
  inRange: "2026-03-15",
  after: "2026-03-25",
} as const

/** Pre-CS-C billing set — status strings only. Dates were ignored. */
const OLD_APPROVED_OR_BEYOND = new Set(["approved", "booked", "completed"])

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")

function dates(todayYmd: string) {
  return {
    startDate: START,
    endDate: END,
    today: sydneyCivilDayFromYmd(todayYmd),
  }
}

describe("a. download gate — publication, never campaign_status", () => {
  it("unpublished → blocked; published → allowed", () => {
    assert.equal(isVersionPublished({ publishedAt: null }), false)
    assert.equal(isVersionPublished({ published_at: null }), false)
    assert.equal(isVersionPublished({}), false)
    assert.equal(
      isVersionPublished({ publishedAt: "2026-06-01T00:00:00.000Z" }),
      true
    )
  })

  it("unpublishedDocumentError never interpolates campaign_status", () => {
    const download = unpublishedDocumentError("download")
    const render = unpublishedDocumentError("render")
    assert.equal(download.includes("campaign_status"), false)
    assert.equal(render.includes("campaign_status"), false)
    assert.match(download, /published_at/)
    assert.match(render, /published_at/)
    assert.equal(unpublishedDocumentError.length, 1)
  })

  it("DOWNLOAD_BLOCKED_MESSAGE talks about publishing, not status", () => {
    assert.match(DOWNLOAD_BLOCKED_MESSAGE, /[Pp]ublish/)
    assert.equal(/draft/i.test(DOWNLOAD_BLOCKED_MESSAGE), false)
    assert.equal(/status/i.test(DOWNLOAD_BLOCKED_MESSAGE), false)
  })

  it("doc generate/download sources do not consult campaign_status in the gate", () => {
    const files = [
      "app/api/mediaplans/[id]/download/route.ts",
      "app/api/mediaplans/generate-pdf/route.ts",
      "lib/docs/buildMbaFromPersisted.ts",
      "lib/docs/saveDocSteps.ts",
    ]
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), "utf8")
      assert.equal(
        src.includes("campaign_status="),
        false,
        `${rel} still interpolates campaign_status into the unpublished error`
      )
      assert.equal(
        src.includes("isDownloadableCampaignStatus"),
        false,
        `${rel} must not import the leftover hotfix predicate`
      )
      assert.match(src, /isVersionPublished/)
    }
  })
})

describe("b. isApprovedOrBeyond — approved|booked or phase completed; 181-lock", () => {
  it("matches the old status-only set for every status × date position", () => {
    for (const status of STATUSES) {
      for (const [label, todayYmd] of Object.entries(POSITIONS)) {
        const got = isApprovedOrBeyond(status, dates(todayYmd))
        const expected = OLD_APPROVED_OR_BEYOND.has(status)
        assert.equal(
          got,
          expected,
          `${status} ${label}: expected ${expected} (old string set), got ${got}`
        )
      }
      assert.equal(
        isApprovedOrBeyond(status),
        OLD_APPROVED_OR_BEYOND.has(status),
        `${status} without dates must match the old set (billing writers have no dates)`
      )
    }
  })

  it("stored completed is beyond via phase, not a third status in the commercial set", () => {
    const src = readFileSync(join(ROOT, "lib/docs/isApprovedOrBeyond.ts"), "utf8")
    assert.match(src, /approved.*booked/)
    assert.match(src, /phase === "completed"/)
  })
})

describe("c. isLiveCampaignStatus — phase === live", () => {
  it("approved/booked in range are live; before start and after end are not", () => {
    assert.equal(
      isLiveCampaignStatus("approved", START, END, POSITIONS.inRange),
      true
    )
    assert.equal(
      isLiveCampaignStatus("booked", START, END, POSITIONS.inRange),
      true
    )
    assert.equal(
      isLiveCampaignStatus("approved", START, END, POSITIONS.before),
      false
    )
    assert.equal(
      isLiveCampaignStatus("booked", START, END, POSITIONS.after),
      false
    )
  })

  it("draft/planned/completed/cancelled are never live at any date position", () => {
    for (const status of ["draft", "planned", "completed", "cancelled"] as const) {
      for (const todayYmd of Object.values(POSITIONS)) {
        assert.equal(
          isLiveCampaignStatus(status, START, END, todayYmd),
          false,
          `${status} @ ${todayYmd}`
        )
      }
    }
  })
})

describe("CS-C1. Home overview inclusion is commercial; display is phase", () => {
  it("DashboardOverview picker uses isPlannedBasisCampaignStatus, not isLiveOrCompletedPhase", () => {
    const src = readFileSync(
      join(ROOT, "components/dashboard/DashboardOverview.tsx"),
      "utf8"
    )
    assert.match(src, /isPlannedBasisCampaignStatus/)
    assert.equal(src.includes("isLiveOrCompletedPhase"), false)
    assert.match(src, /CampaignStatusBadge/)
  })
})

describe("d. dashboard live-or-completed — phase in (live, completed)", () => {
  it("includes in-range approved/booked and after-end / stored completed", () => {
    assert.equal(
      isLiveOrCompletedPhase({
        status: "approved",
        ...dates(POSITIONS.inRange),
      }),
      true
    )
    assert.equal(
      isLiveOrCompletedPhase({
        status: "booked",
        ...dates(POSITIONS.after),
      }),
      true
    )
    assert.equal(
      isLiveOrCompletedPhase({
        status: "completed",
        ...dates(POSITIONS.inRange),
      }),
      true
    )
  })

  it("excludes approved/booked before start, planned, draft", () => {
    assert.equal(
      isLiveOrCompletedPhase({
        status: "approved",
        ...dates(POSITIONS.before),
      }),
      false
    )
    assert.equal(
      isLiveOrCompletedPhase({
        status: "planned",
        ...dates(POSITIONS.inRange),
      }),
      false
    )
    assert.equal(
      isLiveOrCompletedPhase({
        status: "draft",
        ...dates(POSITIONS.inRange),
      }),
      false
    )
  })
})

describe("e. picker priority — live, then booked, then approved", () => {
  it("ranks derived live ahead of stored booked ahead of stored approved", () => {
    const live = campaignPickerPriorityRank({
      status: "booked",
      ...dates(POSITIONS.inRange),
    })
    const booked = campaignPickerPriorityRank({
      status: "booked",
      ...dates(POSITIONS.before),
    })
    const approved = campaignPickerPriorityRank({
      status: "approved",
      ...dates(POSITIONS.before),
    })
    const rest = campaignPickerPriorityRank({
      status: "planned",
      ...dates(POSITIONS.inRange),
    })
    assert.equal(live, 0)
    assert.equal(booked, 1)
    assert.equal(approved, 2)
    assert.equal(rest, 3)
    assert.ok(live < booked && booked < approved && approved < rest)
  })

  it("does not rank on a stored status string of live", () => {
    for (const rel of [
      "components/creative/ClientCreativePicker.tsx",
      "components/creative/CreativeCampaignPicker.tsx",
      "components/planning/SavedAudienceAttachList.tsx",
    ]) {
      const src = readFileSync(join(ROOT, rel), "utf8")
      assert.equal(src.includes('new Set(["live"'), false, rel)
      assert.match(src, /campaignPickerPriorityRank/)
    }
  })
})

describe("cancelled inside dates is never live on every surface", () => {
  const cancelledInRange = {
    status: "cancelled",
    ...dates(POSITIONS.inRange),
  }

  it("phase", () => {
    assert.notEqual(resolveCampaignPhase(cancelledInRange).phase, "live")
    assert.equal(resolveCampaignPhase(cancelledInRange).phase, "cancelled")
  })

  it("isLiveCampaignStatus", () => {
    assert.equal(
      isLiveCampaignStatus("cancelled", START, END, POSITIONS.inRange),
      false
    )
  })

  it("dashboard live-or-completed", () => {
    assert.equal(isLiveOrCompletedPhase(cancelledInRange), false)
  })

  it("picker rank is rest, not live", () => {
    assert.equal(campaignPickerPriorityRank(cancelledInRange), 3)
  })

  it("billing beyond stays false", () => {
    assert.equal(isApprovedOrBeyond("cancelled", cancelledInRange), false)
  })
})

describe("f. accrual RECEIVABLE_STATUSES — membership frozen (mixed axis)", () => {
  it("still mixes campaign status with billing status; computation set unchanged", () => {
    const src = readFileSync(join(ROOT, "lib/finance/computeAccrual.ts"), "utf8")
    assert.match(
      src,
      /new Set\(\["booked", "approved", "invoiced", "paid"\]\)/
    )
    assert.match(src, /mixed axis/i)
  })
})
