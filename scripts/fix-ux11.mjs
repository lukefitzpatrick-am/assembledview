/**
 * Fix UX-11: per-container dirty flag (not global) + subscribe to page Save only.
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")

const NEW_IMPORT = `import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"
`

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  s = s.replace(
    /import \{\s*signalExpertAppliedToPlan,\s*subscribeExpertApplyDirty,\s*\} from "@\/lib\/mediaplan\/expertApplyDirtyBridge"\r?\n/g,
    NEW_IMPORT
  )

  s = s.replace(
    /useEffect\(\(\) => \{\s*return subscribeExpertApplyDirty\(\s*\(\) => setExpertApplyPendingPageSave\(true\),\s*\(\) => setExpertApplyPendingPageSave\(false\)\s*\)\s*\}, \[\]\)/g,
    `useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])`
  )

  s = s.replace(
    /signalExpertAppliedToPlan\(\)\r?\n(\s*)(set\w+ExpertModalOpen\(false\))/g,
    `setExpertApplyPendingPageSave(true)\n$1$2`
  )

  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("fixed", file)
  } else {
    console.log("check", file)
  }
}
