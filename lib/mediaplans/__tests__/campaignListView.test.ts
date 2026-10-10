import { describe, expect, it } from "vitest"

import {
  CAMPAIGN_LIST_CSV_HEADERS,
  campaignListCsvRows,
  filterCampaignsByStatusChip,
  type CampaignListRow,
} from "../campaignListView"

const today = new Date(2026, 9, 10)

const liveBooked: CampaignListRow = {
  campaign_status: "booked",
  campaign_start_date: "2026-08-01",
  campaign_end_date: "2026-10-25",
  mp_campaignname: "Spring",
  mp_client_name: "Acme",
  mba_number: "MBA-1",
  version_number: 3,
  mp_campaignbudget: 120000,
}

const planned: CampaignListRow = {
  campaign_status: "planned",
  campaign_start_date: "2026-11-01",
  campaign_end_date: "2026-12-01",
  mp_campaignname: "Later",
  mp_client_name: "Acme",
  mba_number: "MBA-2",
  version_number: 1,
  mp_campaignbudget: 0,
}

describe("campaign status chip filter", () => {
  it("Live keeps an in-range booked campaign and drops Planned", () => {
    const rows = filterCampaignsByStatusChip([liveBooked, planned], "live", today)
    expect(rows.map((row) => row.mba_number)).toEqual(["MBA-1"])
  })

  it("All keeps every phase", () => {
    expect(filterCampaignsByStatusChip([liveBooked, planned], "all", today)).toHaveLength(2)
  })
})

describe("campaign list CSV columns", () => {
  it("exports the filtered rows with the campaign column set", () => {
    const rows = campaignListCsvRows(
      filterCampaignsByStatusChip([liveBooked, planned], "live", today),
      {
        today,
        mediaLabels: () => ["TV", "BVOD", "Social", "Search"],
        formatBudget: (amount) => String(amount ?? ""),
      },
    )

    expect(rows[0]).toEqual([...CAMPAIGN_LIST_CSV_HEADERS])
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual([
      "Spring",
      "Acme",
      "MBA-1",
      "Live",
      "1 Aug 2026 to 25 Oct 2026",
      "TV; BVOD; Social; Search",
      "120000",
      "3",
    ])
  })
})
