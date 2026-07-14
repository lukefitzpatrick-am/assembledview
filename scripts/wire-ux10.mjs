/**
 * UX-10: grid header microcopy + summary Total/By month titles.
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")

const DELIVERABLES_TITLE =
  "Enter deliverable quantities per week (spots, impressions, clicks, etc.)."
const BUDGET_TITLE =
  "Enter $ amounts per week; converted to deliverables via the row unit rate. Stored as deliverables."
const BILLING_TITLE =
  "Show or hide fee / media / total billing columns on the schedule."
const ADD_ROWS_INPUT_TITLE = "How many empty rows to append (1–500)."
const ADD_ROWS_EXPR =
  "{`Add ${Math.max(1, Math.min(500, Number.parseInt(rowCountInput || \"1\", 10) || 1))} rows`}"

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("ExpertGrid.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  s = s.replace(
    /title="Cells accept deliverable quantities[^"]*"/g,
    `title="${DELIVERABLES_TITLE}"`
  )
  s = s.replace(
    /title="Cells accept \$ amounts[^"]*"/g,
    `title="${BUDGET_TITLE}"`
  )
  s = s.replace(
    /title="Rows to append[^"]*"/g,
    `title="${ADD_ROWS_INPUT_TITLE}"`
  )
  s = s.replace(
    /title="Append as many empty rows[^"]*"/g,
    `title="${ADD_ROWS_INPUT_TITLE}"`
  )

  s = s.replace(
    /<Label htmlFor="([^"]+)" className="text-sm whitespace-nowrap">\s*Rows:\s*<\/Label>/g,
    '<Label htmlFor="$1" className="sr-only">Add rows count</Label>'
  )

  s = s.replace(
    /(<Plus className="mr-1 h-4 w-4" \/>)\s*Add row/g,
    `$1\n              ${ADD_ROWS_EXPR}`
  )

  // Billing button — insert title before onClick setShowBillingCols if missing
  if (!s.includes(BILLING_TITLE)) {
    s = s.replace(
      /onClick=\{\(\) => setShowBillingCols\(\(v\) => !v\)\}/g,
      `title="${BILLING_TITLE}"\n              onClick={() => setShowBillingCols((v) => !v)}`
    )
  }

  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("grid", file)
  } else {
    console.log("no change", file)
  }
}

{
  const fp = path.join(DIR, "MediaContainerSummarySection.tsx")
  let s = fs.readFileSync(fp, "utf8")
  if (!s.includes('Split group spend across campaign months')) {
    s = s.replace(
      'key={view}\n                  type="button"\n                  aria-pressed={active}\n',
      `key={view}
                  type="button"
                  aria-pressed={active}
                  title={
                    view === "By month"
                      ? "Split group spend across campaign months"
                      : "Show total spend per group for the whole campaign"
                  }
`
    )
    fs.writeFileSync(fp, s)
    console.log("summary ok")
  } else {
    console.log("summary already")
  }
}
