/**
 * Compare two media-plan .xlsx files.
 *
 * Usage:
 *   npx tsx scripts/compare-plan-workbooks.ts <expected.xlsx> <actual.xlsx>
 *
 * expected = Xano-era file; actual = regenerated --out file.
 * Exit 1 on any totals-cell diff.
 */

import {
  comparePlanWorkbooks,
  formatWorkbookCompareReport,
} from "@/lib/docs/comparePlanWorkbooks"

async function main() {
  const expectedPath = process.argv[2]
  const actualPath = process.argv[3]
  if (!expectedPath || !actualPath) {
    console.error("Usage: compare-plan-workbooks.ts <expected.xlsx> <actual.xlsx>")
    process.exit(1)
  }
  const report = await comparePlanWorkbooks(expectedPath, actualPath)
  console.log(formatWorkbookCompareReport(report))
  if (report.hasTotalsDiff) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
