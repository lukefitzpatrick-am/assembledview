/**
 * UX-11: Rename Apply + dirty until page Save.
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")
const BRIDGE_IMPORT = `import {
  signalExpertAppliedToPlan,
  subscribeExpertApplyDirty,
} from "@/lib/mediaplan/expertApplyDirtyBridge"
`

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  if (!s.includes("signalExpertAppliedToPlan")) {
    s = s.replace(
      '"use client"\n\n',
      `"use client"\n\n${BRIDGE_IMPORT}`
    )
  }

  // State + subscription for pending page save after expert apply
  if (!s.includes("expertApplyPendingPageSave")) {
    // Insert after first useState(false) for expert modal if possible — after "use client" imports block into component
    // Place near other expert state: find ExpertModalOpen useState
    const modalState = s.match(
      /const \[(\w+ExpertModalOpen), set\w+ExpertModalOpen\] = useState\(false\)/
    )
    if (modalState) {
      const insertAfter = modalState[0]
      s = s.replace(
        insertAfter,
        `${insertAfter}

  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeExpertApplyDirty(
      () => setExpertApplyPendingPageSave(true),
      () => setExpertApplyPendingPageSave(false)
    )
  }, [])`
      )
    }
  }

  // Call signal on Apply handlers — before modal close setXxxExpertModalOpen(false)
  // Find handleXxxExpertApply and inject signal near end before setModal false
  s = s.replace(
    /(const handle\w+ExpertApply = useCallback\(\(\) => \{[\s\S]*?)(set\w+ExpertModalOpen\(false\))/g,
    (match, head, close) => {
      if (head.includes("signalExpertAppliedToPlan")) return match
      return `${head}signalExpertAppliedToPlan()\n    ${close}`
    }
  )

  // Cinema may have two Apply buttons
  s = s.replace(/>Apply changes</g, ">Apply to plan (not saved yet)<")
  s = s.replace(
    /(<Button type="button" onClick=\{handle\w+ExpertApply\}>\s*)Apply(\s*<\/Button>)/g,
    `$1Apply to plan (not saved yet)$2`
  )
  // multiline
  s = s.replace(
    /(<Button type="button" onClick=\{handle\w+ExpertApply\}>\r?\n\s*)Apply(\r?\n\s*<\/Button>)/g,
    `$1Apply to plan (not saved yet)$2`
  )

  // Dirty badge near Apply footer
  if (!s.includes("Applied — not saved yet") && s.includes("expertApplyPendingPageSave")) {
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

  // Card header badge when pending
  if (!s.includes("Not saved to plan yet") && s.includes("expertApplyPendingPageSave")) {
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
    console.log("updated", file)
  } else {
    console.log("no change", file)
  }
}
