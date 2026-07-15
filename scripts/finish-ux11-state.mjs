import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")
const IMPORT = `import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"\n`

const STATE = `
  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])
`

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  if (s.includes("const [expertApplyPendingPageSave,")) {
    console.log("has state", file)
    continue
  }

  if (!s.includes("subscribeMediaPlanPageSaved")) {
    s = s.replace('"use client"\n\n', `"use client"\n\n${IMPORT}`)
  }

  // Multiline or single-line ExpertModalOpen = useState(false)
  const re =
    /const \[\w+[Ee]xpertModalOpen, set\w+[Ee]xpertModalOpen\]\s*=\s*(?:\r?\n\s*)?useState\(false\)/
  if (!re.test(s)) {
    console.warn("still no modal", file)
    continue
  }
  s = s.replace(re, (m) => m + STATE)

  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("added state", file)
  }
}
