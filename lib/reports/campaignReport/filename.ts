export function campaignReportFilename(input: {
  mbaNumber: string
  periodSlug: string
  yyyymmdd: string
}): string {
  const mba = input.mbaNumber.trim().replace(/[^a-zA-Z0-9_-]/g, "") || "mba"
  const period = input.periodSlug.trim().replace(/[^a-zA-Z0-9_-]/g, "") || "period"
  return `campaign-report-${mba}-${period}-${input.yyyymmdd}.pptx`
}
