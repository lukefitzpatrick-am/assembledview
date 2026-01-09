export type BuyType =
  | "CPM"
  | "CPC"
  | "CPV"
  | "LEADS"
  | "BONUS"
  | "FIXED COST"
  | "SUMMARY"

export type Burst = {
  start_date: string
  end_date: string
  media_investment: number
  deliverables: number
}

export type ActualsDaily = {
  date: string
  spend: number
  impressions: number
  clicks: number
  results: number
  video_3s_views: number
}

export type AdSetRow = {
  date: string
  ad_set_name: string
  spend: number
  impressions: number
  clicks: number
  results: number
  video_3s_views: number
}

export type LineItem = {
  line_item_id: string
  line_item_name: string
  buy_type: BuyType
  bursts: Burst[]
  actualsDaily: ActualsDaily[]
  adSetRows: AdSetRow[]
}

export type ContainerSummary = {
  container_id: string
  container_name: string
  buy_type: BuyType
  bursts: Burst[]
  actualsDaily: ActualsDaily[]
}

export type MetaPacingMock = {
  containerSummary: ContainerSummary
  lineItems: LineItem[]
}

const lineItems: LineItem[] = [
  {
    line_item_id: "li_meta_awareness",
    line_item_name: "Meta Social - Awareness",
    buy_type: "CPM",
    bursts: [
      {
        start_date: "2024-06-01",
        end_date: "2024-06-07",
        media_investment: 14000,
        deliverables: 7000000,
      },
      {
        start_date: "2024-06-08",
        end_date: "2024-06-14",
        media_investment: 16000,
        deliverables: 7600000,
      },
    ],
    actualsDaily: [
      {
        date: "2024-06-01",
        spend: 1800,
        impressions: 950000,
        clicks: 12400,
        results: 360,
        video_3s_views: 42000,
      },
      {
        date: "2024-06-02",
        spend: 1950,
        impressions: 1010000,
        clicks: 13250,
        results: 380,
        video_3s_views: 43800,
      },
      {
        date: "2024-06-03",
        spend: 2050,
        impressions: 1085000,
        clicks: 14120,
        results: 392,
        video_3s_views: 45200,
      },
      {
        date: "2024-06-04",
        spend: 2100,
        impressions: 1120000,
        clicks: 14750,
        results: 405,
        video_3s_views: 46500,
      },
      {
        date: "2024-06-05",
        spend: 2150,
        impressions: 1155000,
        clicks: 15280,
        results: 418,
        video_3s_views: 47850,
      },
      {
        date: "2024-06-06",
        spend: 2200,
        impressions: 1180000,
        clicks: 15840,
        results: 430,
        video_3s_views: 49000,
      },
      {
        date: "2024-06-07",
        spend: 2250,
        impressions: 1215000,
        clicks: 16320,
        results: 444,
        video_3s_views: 50200,
      },
      {
        date: "2024-06-08",
        spend: 2350,
        impressions: 1260000,
        clicks: 16950,
        results: 460,
        video_3s_views: 51400,
      },
      {
        date: "2024-06-09",
        spend: 2400,
        impressions: 1305000,
        clicks: 17520,
        results: 472,
        video_3s_views: 52650,
      },
      {
        date: "2024-06-10",
        spend: 2450,
        impressions: 1340000,
        clicks: 18100,
        results: 486,
        video_3s_views: 53900,
      },
      {
        date: "2024-06-11",
        spend: 2500,
        impressions: 1380000,
        clicks: 18600,
        results: 498,
        video_3s_views: 55200,
      },
      {
        date: "2024-06-12",
        spend: 2550,
        impressions: 1420000,
        clicks: 19150,
        results: 512,
        video_3s_views: 56500,
      },
      {
        date: "2024-06-13",
        spend: 2600,
        impressions: 1465000,
        clicks: 19720,
        results: 526,
        video_3s_views: 57850,
      },
      {
        date: "2024-06-14",
        spend: 2650,
        impressions: 1510000,
        clicks: 20250,
        results: 540,
        video_3s_views: 59000,
      },
    ],
    adSetRows: [
      {
        date: "2024-06-01",
        ad_set_name: "Meta Awareness - Broad",
        spend: 950,
        impressions: 520000,
        clicks: 6900,
        results: 180,
        video_3s_views: 22200,
      },
      {
        date: "2024-06-01",
        ad_set_name: "Meta Awareness - Retargeting",
        spend: 850,
        impressions: 430000,
        clicks: 5500,
        results: 180,
        video_3s_views: 19800,
      },
      {
        date: "2024-06-04",
        ad_set_name: "Meta Awareness - Broad",
        spend: 1080,
        impressions: 610000,
        clicks: 8200,
        results: 215,
        video_3s_views: 24100,
      },
      {
        date: "2024-06-04",
        ad_set_name: "Meta Awareness - Retargeting",
        spend: 1020,
        impressions: 510000,
        clicks: 5550,
        results: 190,
        video_3s_views: 22400,
      },
      {
        date: "2024-06-07",
        ad_set_name: "Meta Awareness - Broad",
        spend: 1180,
        impressions: 640000,
        clicks: 8900,
        results: 235,
        video_3s_views: 25500,
      },
      {
        date: "2024-06-07",
        ad_set_name: "Meta Awareness - Retargeting",
        spend: 1070,
        impressions: 575000,
        clicks: 6420,
        results: 209,
        video_3s_views: 24700,
      },
      {
        date: "2024-06-10",
        ad_set_name: "Meta Awareness - Broad",
        spend: 1260,
        impressions: 700000,
        clicks: 9300,
        results: 250,
        video_3s_views: 27200,
      },
      {
        date: "2024-06-10",
        ad_set_name: "Meta Awareness - Retargeting",
        spend: 1190,
        impressions: 640000,
        clicks: 7800,
        results: 236,
        video_3s_views: 26700,
      },
      {
        date: "2024-06-12",
        ad_set_name: "Meta Awareness - Broad",
        spend: 1290,
        impressions: 720000,
        clicks: 9700,
        results: 258,
        video_3s_views: 28200,
      },
      {
        date: "2024-06-12",
        ad_set_name: "Meta Awareness - Retargeting",
        spend: 1260,
        impressions: 700000,
        clicks: 8450,
        results: 254,
        video_3s_views: 28300,
      },
      {
        date: "2024-06-14",
        ad_set_name: "Meta Awareness - Broad",
        spend: 1380,
        impressions: 760000,
        clicks: 10100,
        results: 272,
        video_3s_views: 29600,
      },
      {
        date: "2024-06-14",
        ad_set_name: "Meta Awareness - Retargeting",
        spend: 1270,
        impressions: 750000,
        clicks: 8150,
        results: 268,
        video_3s_views: 29400,
      },
    ],
  },
  {
    line_item_id: "li_meta_conversions",
    line_item_name: "Meta Social - Conversions",
    buy_type: "LEADS",
    bursts: [
      {
        start_date: "2024-06-01",
        end_date: "2024-06-14",
        media_investment: 20000,
        deliverables: 450,
      },
    ],
    actualsDaily: [
      {
        date: "2024-06-01",
        spend: 1100,
        impressions: 220000,
        clicks: 8400,
        results: 28,
        video_3s_views: 14000,
      },
      {
        date: "2024-06-02",
        spend: 1200,
        impressions: 240000,
        clicks: 8800,
        results: 30,
        video_3s_views: 15000,
      },
      {
        date: "2024-06-03",
        spend: 1250,
        impressions: 255000,
        clicks: 9100,
        results: 31,
        video_3s_views: 15500,
      },
      {
        date: "2024-06-04",
        spend: 1300,
        impressions: 260000,
        clicks: 9400,
        results: 33,
        video_3s_views: 16000,
      },
      {
        date: "2024-06-05",
        spend: 1350,
        impressions: 270000,
        clicks: 9800,
        results: 34,
        video_3s_views: 16600,
      },
      {
        date: "2024-06-06",
        spend: 1400,
        impressions: 280000,
        clicks: 10100,
        results: 36,
        video_3s_views: 17200,
      },
      {
        date: "2024-06-07",
        spend: 1450,
        impressions: 290000,
        clicks: 10500,
        results: 37,
        video_3s_views: 17800,
      },
      {
        date: "2024-06-08",
        spend: 1500,
        impressions: 300000,
        clicks: 10850,
        results: 38,
        video_3s_views: 18200,
      },
      {
        date: "2024-06-09",
        spend: 1550,
        impressions: 310000,
        clicks: 11200,
        results: 39,
        video_3s_views: 18800,
      },
      {
        date: "2024-06-10",
        spend: 1600,
        impressions: 320000,
        clicks: 11550,
        results: 41,
        video_3s_views: 19400,
      },
      {
        date: "2024-06-11",
        spend: 1650,
        impressions: 330000,
        clicks: 11900,
        results: 42,
        video_3s_views: 20000,
      },
      {
        date: "2024-06-12",
        spend: 1700,
        impressions: 340000,
        clicks: 12300,
        results: 44,
        video_3s_views: 20600,
      },
      {
        date: "2024-06-13",
        spend: 1750,
        impressions: 350000,
        clicks: 12650,
        results: 45,
        video_3s_views: 21100,
      },
      {
        date: "2024-06-14",
        spend: 1800,
        impressions: 360000,
        clicks: 13000,
        results: 47,
        video_3s_views: 21600,
      },
    ],
    adSetRows: [
      {
        date: "2024-06-02",
        ad_set_name: "Meta Leads - Broad",
        spend: 620,
        impressions: 126000,
        clicks: 4700,
        results: 16,
        video_3s_views: 8400,
      },
      {
        date: "2024-06-02",
        ad_set_name: "Meta Leads - Retargeting",
        spend: 580,
        impressions: 114000,
        clicks: 4100,
        results: 14,
        video_3s_views: 6600,
      },
      {
        date: "2024-06-05",
        ad_set_name: "Meta Leads - Broad",
        spend: 700,
        impressions: 140000,
        clicks: 5200,
        results: 18,
        video_3s_views: 9100,
      },
      {
        date: "2024-06-05",
        ad_set_name: "Meta Leads - Retargeting",
        spend: 650,
        impressions: 130000,
        clicks: 4600,
        results: 16,
        video_3s_views: 7500,
      },
      {
        date: "2024-06-08",
        ad_set_name: "Meta Leads - Broad",
        spend: 760,
        impressions: 150000,
        clicks: 5400,
        results: 19,
        video_3s_views: 9500,
      },
      {
        date: "2024-06-08",
        ad_set_name: "Meta Leads - Retargeting",
        spend: 740,
        impressions: 150000,
        clicks: 4950,
        results: 19,
        video_3s_views: 8700,
      },
      {
        date: "2024-06-11",
        ad_set_name: "Meta Leads - Broad",
        spend: 820,
        impressions: 160000,
        clicks: 5650,
        results: 21,
        video_3s_views: 9800,
      },
      {
        date: "2024-06-11",
        ad_set_name: "Meta Leads - Retargeting",
        spend: 830,
        impressions: 170000,
        clicks: 6250,
        results: 21,
        video_3s_views: 10200,
      },
      {
        date: "2024-06-14",
        ad_set_name: "Meta Leads - Broad",
        spend: 900,
        impressions: 180000,
        clicks: 6400,
        results: 24,
        video_3s_views: 11000,
      },
      {
        date: "2024-06-14",
        ad_set_name: "Meta Leads - Retargeting",
        spend: 900,
        impressions: 180000,
        clicks: 6600,
        results: 23,
        video_3s_views: 10600,
      },
    ],
  },
]

function aggregateContainerSummary(items: LineItem[]): ContainerSummary {
  const allBursts: Burst[] = []
  const actualMap = new Map<string, ActualsDaily>()

  items.forEach((item) => {
    item.bursts.forEach((burst) => {
      allBursts.push({ ...burst })
    })

    item.actualsDaily.forEach((day) => {
      const existing = actualMap.get(day.date)
      if (existing) {
        actualMap.set(day.date, {
          date: day.date,
          spend: existing.spend + day.spend,
          impressions: existing.impressions + day.impressions,
          clicks: existing.clicks + day.clicks,
          results: existing.results + day.results,
          video_3s_views: existing.video_3s_views + day.video_3s_views,
        })
      } else {
        actualMap.set(day.date, { ...day })
      }
    })
  })

  const actualsDaily = Array.from(actualMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  return {
    container_id: "meta_container_summary",
    container_name: "Meta Social - Summary",
    buy_type: "SUMMARY",
    bursts: allBursts,
    actualsDaily,
  }
}

export const mockMetaPacing: MetaPacingMock = {
  containerSummary: aggregateContainerSummary(lineItems),
  lineItems,
}
