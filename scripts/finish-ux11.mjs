/**
 * Ensure every media container has expertApplyPendingPageSave state + UI.
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")
const IMPORT = `import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"\n`

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  if (!s.includes("subscribeMediaPlanPageSaved")) {
    s = s.replace('"use client"\n\n', `"use client"\n\n${IMPORT}`)
  }

  if (!s.includes("const [expertApplyPendingPageSave,")) {
    // Insert after first expert modal open state
    const re = /const \[(\w+[Ee]xpertModalOpen), (set\w+[Ee]xpertModalOpen)\] = useState\(false\)/
    if (re.test(s)) {
      s = s.replace(
        re,
        (m) => `${m}

  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])`
      )
    } else {
      console.warn("no modal state", file)
    }
  }

  // Ensure Apply sets pending
  if (s.includes("setExpertApplyPendingPageSave(true)") === false) {
    s = s.replace(
      /(set\w+[Ee]xpertExitConfirmOpen\(false\)\s*\n\s*)(collapseAllLineItems\(\)\s*\n\s*)?(set\w+[Ee]xpertModalOpen\(false\))/g,
      (match, a, b = "", c) => {
        if (match.includes("setExpertApplyPendingPageSave")) return match
        return `${a}${b}setExpertApplyPendingPageSave(true)\n    ${c}`
      }
    )
  }

  // Footer microcopy
  if (!s.includes("Apply updates the plan draft only") && s.includes("DialogFooter")) {
    s = s.replace(
      /(<DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">)/g,
      `$1
            {expertApplyPendingPageSave ? (
              <span className="mr-auto text-xs text-muted-foreground">
                Applied earlier — awaiting page Save
              </span>
            ) : (
              <span className="mr-auto text-xs text-muted-foreground">
                Apply updates the plan draft only
              </span>
            )}`
    )
  }

  // Header badge
  if (!s.includes("Not saved to plan yet") && s.includes("Schedule grid open")) {
    s = s.replace(
      /(Schedule grid open\s*<\/Badge>\s*\) : null\})/g,
      `$1
                  {expertApplyPendingPageSave ? (
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Not saved to plan yet
                    </Badge>
                  ) : null}`
    )
  }

  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("fixed", file)
  } else {
    console.log("ok", file)
  }
}
