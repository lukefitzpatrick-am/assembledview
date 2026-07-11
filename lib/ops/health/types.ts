export type OpsCheckStatus = "green" | "amber" | "red"

export type OpsCheckResult = {
  name: string
  status: OpsCheckStatus
  detail: string
}

export type OpsHealthReport = {
  asOfDate: string
  checkedAt: string
  results: OpsCheckResult[]
  redCount: number
  amberCount: number
  greenCount: number
}
