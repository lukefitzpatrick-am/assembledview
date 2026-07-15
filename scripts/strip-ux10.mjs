/**
 * Temporarily strip UX-10-only edits so week-commences can commit cleanly.
 * Re-run wire-ux10.mjs after that commit.
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("ExpertGrid.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  s = s.replace(
    /title="Enter deliverable quantities per week \(spots, impressions, clicks, etc\.\)\."/g,
    'title="Cells accept deliverable quantities (spots, impressions, clicks …)"'
  )
  s = s.replace(
    /title="Enter \$ amounts per week; converted to deliverables via the row unit rate\. Stored as deliverables\."/g,
    'title="Cells accept $ amounts, converted to deliverables via the row\'s unit rate. Values are always stored as deliverables."'
  )
  s = s.replace(
    /<Label htmlFor="([^"]+)" className="sr-only">Add rows count<\/Label>/g,
    '<Label htmlFor="$1" className="text-sm whitespace-nowrap">\n                Rows:\n              </Label>'
  )
  s = s.replace(
    /\{\`Add \$\{Math\.max\(1, Math\.min\(500, Number\.parseInt\(rowCountInput \|\| "1", 10\) \|\| 1\)\} rows\`\}/g,
    "Add row"
  )
  s = s.replace(
    /title="How many empty rows to append \(1–500\)\."\n(\s*)onClick=\{addRow\}/g,
    'title="Append as many empty rows as the number in the Rows field (1–500)."\n$1onClick={addRow}'
  )
  s = s.replace(
    /title="How many empty rows to append \(1–500\)\."/g,
    'title="Rows to append when Add row is clicked (1–500)."'
  )
  s = s.replace(
    /\n\s*title="Show or hide fee \/ media \/ total billing columns on the schedule\."/g,
    ""
  )

  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("stripped", file)
  }
}

// Revert summary titles
{
  const fp = path.join(DIR, "MediaContainerSummarySection.tsx")
  let s = fs.readFileSync(fp, "utf8")
  s = s.replace(
    /\n\s*title=\{\s*view === "By month"\s*\? "Split group spend across campaign months"\s*: "Show total spend per group for the whole campaign"\s*\}/g,
    ""
  )
  fs.writeFileSync(fp, s)
  console.log("summary stripped")
}
