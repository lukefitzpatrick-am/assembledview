/**
 * Adopt shared F-28 row virtualizer into a channel *ExpertGrid.tsx using Radio
 * as the structural template. Usage:
 *   node scripts/adopt-expert-grid-virtualizer.cjs TelevisionExpertGrid Television TV Television
 *
 * Args: <FileBase> <PascalChannel> <CONST_PREFIX> <ScheduleRowPrefix>
 * Example: CinemaExpertGrid Cinema CINEMA Cinema
 * Example: TelevisionExpertGrid Television TV Television
 * Example: DigiVideo → DigitalVideoExpertGrid DigitalVideo DIGIVIDEO DigiVideo (row type DigiVideo...)
 */
const fs = require("fs")
const path = require("path")

const [
  ,
  ,
  fileBase,
  pascal,
  CONST,
  rowPrefix = pascal,
] = process.argv

if (!fileBase || !pascal || !CONST) {
  console.error(
    "Usage: node scripts/adopt-expert-grid-virtualizer.cjs <FileBase> <Pascal> <CONST> [RowPrefix]"
  )
  process.exit(1)
}

const filePath = path.join(
  __dirname,
  "../components/media-containers",
  `${fileBase}.tsx`
)
// Files in this repo use CRLF line endings; normalize to LF for the marker
// regexes below and restore CRLF on write.
let s = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n")

if (s.includes("useExpertGridRowVirtualizer")) {
  console.log(`skip ${fileBase}: already virtualized`)
  process.exit(0)
}

const radioPath = path.join(
  __dirname,
  "../components/media-containers/RadioExpertGrid.tsx"
)
const radio = fs.readFileSync(radioPath, "utf8").replace(/\r\n/g, "\n")

// --- 1. Imports (after MemoExpertGridRow import block) ---
const importBlock = `import {
  ExpertGridVirtualSpacerBody,
  useExpertGridRowVirtualizer,
} from "@/components/media-containers/useExpertGridRowVirtualizer"
import {
  OOH_EXPERT_ROW_HEIGHT_PX,
  OOH_EXPERT_ROW_OVERSCAN,
} from "@/lib/mediaplan/oohExpertVirtualization"
`

if (!s.includes('from "@/components/media-containers/MemoExpertGridRow"')) {
  console.error("MemoExpertGridRow import not found")
  process.exit(1)
}
s = s.replace(
  /import \{ MemoExpertGridRow \} from "@\/components\/media-containers\/MemoExpertGridRow"\n/,
  (m) => m + importBlock
)

// --- 2. Constants ---
const constBlock = `
/**
 * F-28 Phase 2 — row virtualization (shared helper from OOH). Fixed row height
 * matches Prompt A (\`OOH_EXPERT_ROW_HEIGHT_PX\`); no measureElement.
 */
const ${CONST}_EXPERT_ROW_VIRTUALIZATION = true
const ${CONST}_EXPERT_ROW_HEIGHT_PX = OOH_EXPERT_ROW_HEIGHT_PX
const ${CONST}_EXPERT_ROW_OVERSCAN = OOH_EXPERT_ROW_OVERSCAN
`

// Insert before buy-type options or first "Parse clipboard" / createEmpty
const constAnchor =
  s.match(/\/\*\*\s*\n \* Parse clipboard/) ||
  s.match(/\/\*\* Match labels\/values on/) ||
  s.match(/const DEBUG_/)
if (!constAnchor) {
  console.error("const anchor not found")
  process.exit(1)
}
const insertAt = s.indexOf(constAnchor[0])
s = s.slice(0, insertAt) + constBlock + "\n" + s.slice(insertAt)

// --- 3. Extract Radio structural snippets with RADIO→CONST/channel renames ---
function radioSnippet(startMarker, endMarker) {
  const a = radio.indexOf(startMarker)
  const b = radio.indexOf(endMarker, a)
  if (a < 0 || b < 0) throw new Error(`radio markers missing: ${startMarker}`)
  return radio.slice(a, b)
}

function adaptRadio(snippet) {
  return snippet
    .replace(/RADIO_EXPERT_ROW_/g, `${CONST}_EXPERT_ROW_`)
    .replace(/radioDescriptorKeys/g, channelDescriptorKeys())
    .replace(/RadioExpertScheduleRow/g, `${rowPrefix}ExpertScheduleRow`)
    .replace(/data-radio-expert-row-index/g, `data-${dataAttr()}-expert-row-index`)
    .replace(/data-radio-expert-grid-scroll/g, `data-${dataAttr()}-expert-grid-scroll`)
}

function channelDescriptorKeys() {
  // Heuristic: find existing *DescriptorKeys in target file
  const m = s.match(/\b([a-zA-Z]+)DescriptorKeys\b/)
  if (!m) throw new Error("descriptorKeys not found in target")
  return m[1] + "DescriptorKeys"
}

function dataAttr() {
  // radio-expert → radio; cinema-expert → cinema from existing data attributes
  const m = s.match(/data-([a-z0-9]+)-expert-grid-scroll/)
  if (m) return m[1]
  return CONST.toLowerCase().replace(/_/g, "")
}

console.log(`descriptorKeys=${channelDescriptorKeys()} dataAttr=${dataAttr()}`)

// Move gridScrollRef early + thead + rowReorderVirtual — mirror Radio by
// replacing `useExpertRowReorder(handleReorder)` block and relocating gridScrollRef.

if (!s.includes("useExpertRowReorder(handleReorder)")) {
  console.error("useExpertRowReorder(handleReorder) not found — diverged?")
  process.exit(1)
}

// Remove late gridScrollRef declaration (keep usages)
const lateScroll = /  const gridScrollRef = useRef<HTMLDivElement>\(null\)\n\n/
const lateMatches = [...s.matchAll(/  const gridScrollRef = useRef<HTMLDivElement>\(null\)\n/g)]
if (lateMatches.length !== 1) {
  console.error(`expected 1 gridScrollRef decl, got ${lateMatches.length}`)
  process.exit(1)
}

const reorderInsert = adaptRadio(
  radioSnippet(
    "  const gridScrollRef = useRef<HTMLDivElement>(null)\n\n  const handleReorder",
    "  const { weekColumnWidths, setWeekColumnWidth } = useExpertWeekColumnWidths()"
  )
)

// Find handleReorder in target and inject before useExpertRowReorder
const handleReorderIdx = s.indexOf("  const handleReorder = useCallback(")
if (handleReorderIdx < 0) {
  console.error("handleReorder not found")
  process.exit(1)
}

// Replace from handleReorder through useExpertRowReorder(handleReorder) with Radio pattern
const reorderEnd = s.indexOf(
  "  const { weekColumnWidths, setWeekColumnWidth } = useExpertWeekColumnWidths()"
)
if (reorderEnd < 0) {
  console.error("weekColumnWidths not found")
  process.exit(1)
}

// Build: keep everything before handleReorder, but if gridScrollRef appears later only, inject early block
const beforeHandle = s.slice(0, handleReorderIdx)
// strip accidental early scroll if none
let mid = reorderInsert
if (!mid.includes("handleReorder")) {
  console.error("adapt failed on reorder insert")
  process.exit(1)
}
s = beforeHandle + mid + s.slice(reorderEnd)

// Remove duplicate gridScrollRef if two remain
const scrollDecls = [...s.matchAll(/  const gridScrollRef = useRef<HTMLDivElement>\(null\)\n/g)]
if (scrollDecls.length > 1) {
  // keep first, remove rest
  let count = 0
  s = s.replace(/  const gridScrollRef = useRef<HTMLDivElement>\(null\)\n\n?/g, (m) => {
    count++
    return count === 1 ? m : ""
  })
}

// --- ensureRowVisible block from Radio (after normalizeRowsRef style area) ---
if (!s.includes("rowVirtualizerRef")) {
  const ensureBlock = adaptRadio(
    radioSnippet(
      "  const rowVirtualizerRef = useRef<{\n",
      "  const handleCellFocus = useCallback"
    )
  )
  // Radio has ensure wired into focus helpers earlier; find a good insertion point:
  // before `const handleCellFocus` OR before pasteMatrixIntoGrid
  const cellFocus = s.indexOf("  const handleCellFocus = useCallback")
  if (cellFocus < 0) {
    console.error("handleCellFocus not found")
    process.exit(1)
  }
  // Radio's ensureRowVisible is BEFORE handleCellFocus in some places and keyboard wiring is earlier.
  // Simpler: insert ensure helpers just before useExpertGridRowVirtualizer call we'll add.
}

// Wire ensureVisible into focusExpertGridCell calls — Radio pattern
if (!s.includes("ensureRowVisible")) {
  // Insert rowVirtualizerRef + ensureRowVisible near handleReorder area (after row reorder hook)
  const afterReorder = s.indexOf(
    "  const { weekColumnWidths, setWeekColumnWidth } = useExpertWeekColumnWidths()"
  )
  const ensureEarly = `  const rowVirtualizerRef = useRef<{\n    scrollToIndex: (\n      index: number,\n      opts?: { align?: "start" | "center" | "end" | "auto" }\n    ) => void\n  } | null>(null)\n\n  const ensureRowVisible = useCallback((rowIndex: number) => {\n    if (!${CONST}_EXPERT_ROW_VIRTUALIZATION) return\n    rowVirtualizerRef.current?.scrollToIndex(rowIndex, { align: "auto" })\n  }, [])\n\n`
  s = s.slice(0, afterReorder) + ensureEarly + s.slice(afterReorder)
}

// Patch focusExpertGridCell / handleExpertGridInputKeyDown to pass ensureRowVisible
// Match common Radio wiring patterns in already-virtualized Radio file
if (s.includes("focusExpertGridCell(") && !s.includes("ensureVisible: ensureRowVisible")) {
  // Replace 3-arg focus calls that end before ensureVisible — fragile; use Radio replacements
  s = s.replace(
    /focusExpertGridCell\(\s*domGridId,\s*nextRow,\s*nextCol\s*\)/g,
    "focusExpertGridCell(\n            domGridId,\n            nextRow,\n            nextCol,\n            ensureRowVisible\n          )"
  )
  s = s.replace(
    /focusExpertGridCell\(\s*domGridId,\s*rowIndex,\s*colIndex\s*\)/g,
    "focusExpertGridCell(\n            domGridId,\n            rowIndex,\n            colIndex,\n            ensureRowVisible\n          )"
  )
  // handleExpertGridInputKeyDown — add ensureVisible in options object if present
  s = s.replace(
    /handleExpertGridInputKeyDown\(\{([^}]*)\}\)/gs,
    (full, inner) => {
      if (inner.includes("ensureVisible")) return full
      return `handleExpertGridInputKeyDown({${inner}        ensureVisible: ensureRowVisible,\n      })`
    }
  )
}

// --- useExpertGridRowVirtualizer + virtualSpacerColSpan ---
if (!s.includes("useExpertGridRowVirtualizer({")) {
  const virtBlock = adaptRadio(
    radioSnippet(
      "  const {\n    virtualItems,\n    paddingTop,\n    paddingBottom,\n    scrollToIndex,\n  } = useExpertGridRowVirtualizer({",
      "  useEffect(() => {\n    const handleDocumentPointerDown"
    )
  )
  const pointerDown = s.indexOf(
    "  useEffect(() => {\n    const handleDocumentPointerDown"
  )
  if (pointerDown < 0) {
    // try alternate - insert before handleCellFocus
    const hc = s.indexOf("  const handleCellFocus = useCallback")
    if (hc < 0) {
      console.error("insertion point for virtualizer missing")
      process.exit(1)
    }
    s = s.slice(0, hc) + virtBlock + s.slice(hc)
  } else {
    s = s.slice(0, pointerDown) + virtBlock + s.slice(pointerDown)
  }
}

// thead ref
s = s.replace(
  /<thead className="\[&_tr\]:border-b-0">/,
  '<thead ref={theadRef} className="[&_tr]:border-b-0">'
)

// billing min-h-10 → h-8
s = s.replace(
  /flex min-h-10 items-center justify-center py-1\.5/g,
  "flex h-8 items-center justify-center overflow-hidden"
)

// --- tbody virtualization: hard — copy from Radio's renderScheduleRow close pattern ---
// Replace `{normalizedRows.map((row, rowIndex) => {` opening with renderScheduleRow IIFE start from Radio adapted

const mapOpen = "{normalizedRows.map((row, rowIndex) => {"
const mapOpenIdx = s.indexOf(mapOpen)
if (mapOpenIdx < 0) {
  console.error("normalizedRows.map schedule open not found")
  process.exit(1)
}

// Find matching close `})}` before Weekly totals — Radio uses `})}` then `<tr` weekly totals
const weeklyTotalsMarker = 'Weekly totals'
// Walk from mapOpen to find the schedule map close: pattern `})\n                    <tr` before totals
const afterMap = s.slice(mapOpenIdx)
const totalsRel = afterMap.indexOf(weeklyTotalsMarker)
if (totalsRel < 0) {
  console.error("Weekly totals not found")
  process.exit(1)
}
// Look backwards from totals for `                    })}\n                    <tr`
const beforeTotals = afterMap.slice(0, totalsRel)
const closeRe = /\n                    \}\)\}\n                    <tr\n                      className="border-t-2 border-solid font-medium"/
const closeMatch = beforeTotals.match(closeRe)
if (!closeMatch) {
  console.error("map close before Weekly totals not found — grid diverged")
  process.exit(1)
}

const innerStart = mapOpenIdx + mapOpen.length
const closeIdx = mapOpenIdx + beforeTotals.lastIndexOf(closeMatch[0])
const innerBody = s.slice(innerStart, closeIdx)

// Radio wraps: IIFE with renderScheduleRow = (row, rowIndex) => { INNER without outer map }
// INNER currently starts with rowMergeMap etc and ends before `})}` 
// The map body ends with `})}`  of MemoExpertGridRow + `})` of map

// Check Radio structure for rewrite
const radioMapOpen = radio.indexOf(
  "{(() => {\n                      const renderScheduleRow = ("
)
if (radioMapOpen < 0) {
  console.error("Radio renderScheduleRow template missing")
  process.exit(1)
}

const openReplace = `{(() => {
                      const renderScheduleRow = (
                        row: ${rowPrefix}ExpertScheduleRow,
                        rowIndex: number
                      ) => {`

// Transform inner: the old map body starts with const rowMergeMap... and ends with MemoExpertGridRow closing `)}` then `)}` 
// Actually old structure:
// map((row, rowIndex) => {
//   ...sigs...
//   return (
//     <MemoExpertGridRow
//       render={() => {
//         ...
//         return (<tr>...</tr>)
//       }}
//     />
//   )
// })

// New: renderScheduleRow = (row, rowIndex) => { same body }
// Close with } then virtual branch

const closeReplace = `
                      }

                      if (!${CONST}_EXPERT_ROW_VIRTUALIZATION) {
                        return normalizedRows.map((row, rowIndex) =>
                          renderScheduleRow(row, rowIndex)
                        )
                      }

                      return (
                        <ExpertGridVirtualSpacerBody
                          colSpan={virtualSpacerColSpan}
                          paddingTop={paddingTop}
                          paddingBottom={paddingBottom}
                        >
                          {virtualItems.map((vi) => {
                            const row = normalizedRows[vi.index]
                            if (!row) return null
                            return renderScheduleRow(row, vi.index)
                          })}
                        </ExpertGridVirtualSpacerBody>
                      )
                    })()}
                    <tr
                      className="border-t-2 border-solid font-medium"`

s =
  s.slice(0, mapOpenIdx) +
  openReplace +
  innerBody +
  closeReplace +
  s.slice(closeIdx + closeMatch[0].length)

// Fixed height on schedule tr — find `style={stripeStyle}` pattern on schedule rows
s = s.replace(
  /style=\{stripeStyle\}\n([^]*?)\{\.\.\.rowDropProps\(rowIndex\)\}/,
  `data-${dataAttr()}-expert-row-index={rowIndex}
                          style={{
                            ...stripeStyle,
                            height: ${CONST}_EXPERT_ROW_HEIGHT_PX,
                            maxHeight: ${CONST}_EXPERT_ROW_HEIGHT_PX,
                          }}
$1{...rowDropProps(rowIndex)}`
)

// Also handle style={stripeStyle} on same line patterns without data attr yet
if (!s.includes(`${CONST}_EXPERT_ROW_HEIGHT_PX` + ",") && !s.includes(`height: ${CONST}_EXPERT_ROW_HEIGHT_PX`)) {
  s = s.replace(
    /(\s+)style=\{stripeStyle\}\n(\s+)\{\.\.\.rowDropProps\(rowIndex\)\}/,
    `$1data-${dataAttr()}-expert-row-index={rowIndex}
$1style={{
$1  ...stripeStyle,
$1  height: ${CONST}_EXPERT_ROW_HEIGHT_PX,
$1  maxHeight: ${CONST}_EXPERT_ROW_HEIGHT_PX,
$1}}
$2{...rowDropProps(rowIndex)}`
  )
}

fs.writeFileSync(filePath, s.replace(/\n/g, "\r\n"))
console.log(`wrote ${filePath}`)
console.log("NOTE: manually verify ensureRowVisible keyboard wiring + tr height if needed")
