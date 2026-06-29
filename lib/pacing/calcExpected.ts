type ExpectedDay = {
  date: string
  expected_spend: number
  expected_deliverables: number
}

type ExpectedSeries = {
  date: string
  cumulative_expected_spend: number
  cumulative_expected_deliverables: number
}

export type ExpectedResult = {
  daily: ExpectedDay[]
  cumulative: ExpectedSeries[]
  totals: {
    spend: number
    deliverables: number
  }
}
