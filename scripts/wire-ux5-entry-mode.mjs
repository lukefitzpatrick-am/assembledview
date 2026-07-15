/**
 * Wire UX-5: Card entry / Schedule grid labels + session remember.
 * Run: node scripts/wire-ux5-entry-mode.mjs
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")
const files = fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))

const IMPORT_TOGGLE = `import { ContainerEntryModeToggle } from "@/components/media-containers/ContainerEntryModeToggle"`
const IMPORT_MODE = `import {
  readContainerEntryMode,
  writeContainerEntryMode,
  type ContainerEntryMode,
} from "@/lib/mediaplan/containerEntryMode"`

function ensureImport(src, stmt) {
  if (src.includes(stmt.split("\n")[0])) return src
  // After last relative @/media-containers import or before export default
  const anchor = src.indexOf('from "@/components/media-containers/')
  if (anchor < 0) {
    return stmt + "\n" + src
  }
  const lineEnd = src.indexOf("\n", src.indexOf("\n", anchor) > -1 ? src.lastIndexOf("import", anchor + 200) : anchor)
  // simpler: insert after first import block line that mentions ExpertGrid
  const m = src.match(/import[\s\S]*?from "@\/components\/media-containers\/[^"]+"\n/)
  if (m) {
    return src.replace(m[0], m[0] + stmt + "\n")
  }
  return stmt + "\n" + src
}

for (const file of files) {
  const fp = path.join(DIR, file)
  let src = fs.readFileSync(fp, "utf8")
  const before = src

  if (!src.includes("ContainerEntryModeToggle")) {
    // Add imports near expert grid import
    if (!src.includes('ContainerEntryModeToggle')) {
      src = src.replace(
        /(import[\s\S]*?from "@\/components\/media-containers\/[^"]+ExpertGrid"\n)/,
        `$1${IMPORT_TOGGLE}\n`
      )
      if (!src.includes("ContainerEntryModeToggle")) {
        src = IMPORT_TOGGLE + "\n" + src
      }
    }
    if (!src.includes("readContainerEntryMode")) {
      src = src.replace(
        IMPORT_TOGGLE + "\n",
        IMPORT_TOGGLE + "\n" + IMPORT_MODE + "\n"
      )
      if (!src.includes("readContainerEntryMode")) {
        src = IMPORT_MODE + "\n" + src
      }
    }
  }

  // Replace Common "Standard"/"Expert" button group — pattern varies.
  // Match from role="group" aria-label="... entry mode" through closing </div> of the group
  // Then also replace "Card-based entry" hint paragraph.

  // Simpler approach: replace labels Standard→Card entry, Expert→Schedule grid
  // and update hint; add session open effect.

  src = src.replace(/>\s*Standard\s*<\/button>/g, ">Card entry</button>")
  src = src.replace(/>\s*Expert\s*<\/button>/g, ">Schedule grid</button>")

  // Update static hint (when shown under toggle)
  src = src.replace(
    /<p className="text-sm text-muted-foreground">Card-based entry<\/p>/g,
    `<p className="text-sm text-muted-foreground">
                  One card per line — or switch to Schedule grid for week quantities.
                </p>`
  )

  // Session remember: after expert modal open state declaration, add preferred mode effect.
  // Find patterns like: const [bvodExpertModalOpen, setBvodExpertModalOpen] = useState(false)
  const modalStateRe =
    /const \[(\w+)ExpertModalOpen, (set\w+ExpertModalOpen)\] = useState\((?:false)\)/g

  let match
  const found = []
  while ((match = modalStateRe.exec(src))) {
    found.push({ open: match[1] + "ExpertModalOpen", setter: match[2], full: match[0], index: match.index })
  }

  for (const f of found) {
    // Derive open function name: openBvodExpertModal / openTvExpertModal etc.
    // Heuristic: search for open*ExpertModal near
    const openFnMatch = src.slice(Math.max(0, f.index - 50), f.index + 800).match(
      /const (open\w+ExpertModal)\s*=/
    )
    // Also look ahead for openXxx
    const ahead = src.slice(f.index, f.index + 3000)
    const openFnMatch2 = ahead.match(/const (open\w+Expert(?:Modal)?)\s*=\s*useCallback/)
    const openFn = openFnMatch2?.[1] || openFnMatch?.[1]

    if (!openFn) continue
    if (src.includes(`/* ux5-session-${f.open} */`)) continue

    const effect = `
  /* ux5-session-${f.open} */
  useEffect(() => {
    if (readContainerEntryMode() !== "schedule") return
    if (${f.open}) return
    ${openFn}()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session preference once on mount
  }, [])
`
    // Insert after openFn definition end is hard; insert after modal state line instead and call open after openFn exists via timeout
    // Better: insert effect after openFn callback closes — search for openFn block end

    const openIdx = src.indexOf(`const ${openFn}`)
    if (openIdx < 0) continue
    // Find matching useCallback end: `}, [` ... `])`
    const afterOpen = src.indexOf("}, [", openIdx)
    if (afterOpen < 0) continue
    const endCb = src.indexOf(")", afterOpen)
    if (endCb < 0) continue
    const insertAt = endCb + 1
    src = src.slice(0, insertAt) + effect + src.slice(insertAt)
  }

  // Write preference when toggling — inject into Standard and Expert onClick handlers
  // Standard click: writeContainerEntryMode("card")
  // Expert click: writeContainerEntryMode("schedule")

  // Pattern: if (xxxExpertModalOpen) { handleXxxExpertModalOpenChange(false) }
  src = src.replace(
    /(if\s*\((\w+ExpertModalOpen)\)\s*\{\s*\n?\s*)(handle\w+ExpertModalOpenChange\(false\))/g,
    `$1writeContainerEntryMode("card")\n                      $3`
  )

  // Pattern: if (!xxxExpertModalOpen) { openXxxExpertModal() }
  src = src.replace(
    /(if\s*\(!(\w+ExpertModalOpen)\)\s*\{\s*\n?\s*)(open\w+ExpertModal\(\))/g,
    `$1writeContainerEntryMode("schedule")\n                        $3`
  )

  if (src !== before) {
    fs.writeFileSync(fp, src)
    console.log("updated", file)
  } else {
    console.log("no change", file)
  }
}
