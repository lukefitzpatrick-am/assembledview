/**
 * One-off generator: SocialMediaExpertGrid.tsx → Prog*ExpertGrid.tsx
 * Run: node scripts/gen-prog-expert-grids.cjs
 */
const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
const templatePath = path.join(
  root,
  "components/media-containers/SocialMediaExpertGrid.tsx"
)
const template = fs.readFileSync(templatePath, "utf8").replace(/\r\n/g, "\n")

const BUY_AUDIO = `/** Match labels/values on ProgAudioContainer buy-type combobox. */
const PROGAUDIO_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

function normalizeProgAudioBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = PROGAUDIO_BUY_TYPE_OPTIONS.find(
    (o) => o.value.toLowerCase() === v.toLowerCase()
  )
  if (byValue) return byValue.value
  const byLabel = PROGAUDIO_BUY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === v.toLowerCase()
  )
  if (byLabel) return byLabel.value
  return v
}`

const BUY_BVOD = `/** Match labels/values on ProgBVODContainer buy-type combobox. */
const PROGBVOD_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

function normalizeProgBvodBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = PROGBVOD_BUY_TYPE_OPTIONS.find(
    (o) => o.value.toLowerCase() === v.toLowerCase()
  )
  if (byValue) return byValue.value
  const byLabel = PROGBVOD_BUY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === v.toLowerCase()
  )
  if (byLabel) return byLabel.value
  return v
}`

const BUY_DISPLAY_OOH = `/** Match labels/values on Prog Display / Prog OOH buy-type combobox. */
const PROGDISPLAY_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

function normalizeProgDisplayBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = PROGDISPLAY_BUY_TYPE_OPTIONS.find(
    (o) => o.value.toLowerCase() === v.toLowerCase()
  )
  if (byValue) return byValue.value
  const byLabel = PROGDISPLAY_BUY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === v.toLowerCase()
  )
  if (byLabel) return byLabel.value
  return v
}`

const BUY_OOH = `/** Match labels/values on Prog OOH buy-type combobox. */
const PROGOOH_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

function normalizeProgOohBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = PROGOOH_BUY_TYPE_OPTIONS.find(
    (o) => o.value.toLowerCase() === v.toLowerCase()
  )
  if (byValue) return byValue.value
  const byLabel = PROGOOH_BUY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === v.toLowerCase()
  )
  if (byLabel) return byLabel.value
  return v
}`

const BUY_VIDEO = `/** Match labels/values on ProgVideoContainer buy-type combobox. */
const PROGVIDEO_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

function normalizeProgVideoBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = PROGVIDEO_BUY_TYPE_OPTIONS.find(
    (o) => o.value.toLowerCase() === v.toLowerCase()
  )
  if (byValue) return byValue.value
  const byLabel = PROGVIDEO_BUY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === v.toLowerCase()
  )
  if (byLabel) return byLabel.value
  return v
}`

const SOCIAL_BUY_BLOCK =
  /\/\*\* Match labels\/values on \{[^}]*\} buy-type combobox\. \*\/\r?\nconst SOCIALMEDIA_BUY_TYPE_OPTIONS:[\s\S]*?\r?\n\r?\nfunction normalizeSocialMediaBuyTypePaste[\s\S]*?\r?\n}/

const variants = [
  {
    file: "ProgAudioExpertGrid.tsx",
    rowType: "ProgAudioExpertScheduleRow",
    prefix: "ProgAudio",
    slug: "progaudio",
    theme: "progaudio",
    fee: "feeprogaudio",
    title: "Programmatic Audio",
    buyBlock: BUY_AUDIO,
    buyConst: "PROGAUDIO_BUY_TYPE_OPTIONS",
    normalizeBuyFn: "normalizeProgAudioBuyTypePaste",
    normalizePlatformFn: "normalizeProgAudioPlatformPaste",
    placementSize: false,
  },
  {
    file: "ProgBVODExpertGrid.tsx",
    rowType: "ProgBvodExpertScheduleRow",
    prefix: "ProgBvod",
    slug: "progbvod",
    theme: "progbvod",
    fee: "feeprogbvod",
    title: "Programmatic BVOD",
    buyBlock: BUY_BVOD,
    buyConst: "PROGBVOD_BUY_TYPE_OPTIONS",
    normalizeBuyFn: "normalizeProgBvodBuyTypePaste",
    normalizePlatformFn: "normalizeProgBvodPlatformPaste",
    placementSize: false,
  },
  {
    file: "ProgDisplayExpertGrid.tsx",
    rowType: "ProgDisplayExpertScheduleRow",
    prefix: "ProgDisplay",
    slug: "progdisplay",
    theme: "progdisplay",
    fee: "feeprogdisplay",
    title: "Programmatic Display",
    buyBlock: BUY_DISPLAY_OOH,
    buyConst: "PROGDISPLAY_BUY_TYPE_OPTIONS",
    normalizeBuyFn: "normalizeProgDisplayBuyTypePaste",
    normalizePlatformFn: "normalizeProgDisplayPlatformPaste",
    placementSize: false,
  },
  {
    file: "ProgVideoExpertGrid.tsx",
    rowType: "ProgVideoExpertScheduleRow",
    prefix: "ProgVideo",
    slug: "progvideo",
    theme: "progvideo",
    fee: "feeprogvideo",
    title: "Programmatic Video",
    buyBlock: BUY_VIDEO,
    buyConst: "PROGVIDEO_BUY_TYPE_OPTIONS",
    normalizeBuyFn: "normalizeProgVideoBuyTypePaste",
    normalizePlatformFn: "normalizeProgVideoPlatformPaste",
    placementSize: true,
  },
  {
    file: "ProgOOHExpertGrid.tsx",
    rowType: "ProgOohExpertScheduleRow",
    prefix: "ProgOoh",
    slug: "progooh",
    theme: "progooh",
    fee: "feeprogooh",
    title: "Programmatic OOH",
    buyBlock: BUY_OOH,
    buyConst: "PROGOOH_BUY_TYPE_OPTIONS",
    normalizeBuyFn: "normalizeProgOohBuyTypePaste",
    normalizePlatformFn: "normalizeProgOohPlatformPaste",
    placementSize: true,
  },
]

function applyPlacementSize(s, v) {
  if (!v.placementSize) return s
  const row = v.rowType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const coreRe = new RegExp(
    `const ([A-Z0-9_]+_DESCRIPTOR_CORE): readonly \\(keyof ${row}\\)\\[] = \\[\\s*` +
      `"startDate",\\s*` +
      `"endDate",\\s*` +
      `"platform",\\s*` +
      `"bidStrategy",\\s*` +
      `"buyType",\\s*` +
      `"creativeTargeting",\\s*` +
      `"creative",\\s*` +
      `"buyingDemo",`,
    "m"
  )
  s = s.replace(
    coreRe,
    `const $1: readonly (keyof ${row})[] = [
  "startDate",
  "endDate",
  "platform",
  "bidStrategy",
  "buyType",
  "creativeTargeting",
  "creative",
  "placement",
  "size",
  "buyingDemo",`
  )
  s = s.replace(
    /descriptorColWidths = useMemo\(\s*\(\) => \[48, 48, 120, 110, 96, 120, 110, 110, 96, 40, 40, 40, 40, 88\]/,
    "descriptorColWidths = useMemo(\n    () => [48, 48, 120, 110, 96, 120, 110, 110, 80, 110, 96, 40, 40, 40, 40, 88]"
  )
  s = s.replace(
    /const core = \[\s*"Start Date",[\s\S]*?"Creative",\s*"Buying Demo",/m,
    `const core = [
      "Start Date",
      "End Date",
      "Platform",
      "Bid Strategy",
      "Buy Type",
      "Creative Targeting",
      "Creative",
      "Placement",
      "Size",
      "Buying Demo",`
  )
  s = s.replace(
    /(creative: "",\s*)buyingDemo: ""/,
    "$1placement: \"\",\n    size: \"\",\n    buyingDemo: \"\""
  )
  const cDemoSnip = `const cDemo = colIndexOf("buyingDemo")`
  const insertCols = `const cPlc = colIndexOf("placement")
                      const cSiz = colIndexOf("size")
                      ${cDemoSnip}`
  s = s.replace(cDemoSnip, insertCols)
  const creativeTdEnd = `onChange={(e) =>
                                updateRow(rowIndex, {
                                  creative: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cDemo)}`
  if (!s.includes(creativeTdEnd)) {
    throw new Error("placementSize: could not find creative td anchor")
  }
  const placementBlock = `onChange={(e) =>
                                updateRow(rowIndex, {
                                  creative: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cPlc)}
                            style={stickyStyleBody(cPlc)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cPlc
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.placement}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "placement")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cPlc, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  placement: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cSiz)}
                            style={stickyStyleBody(cSiz)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cSiz
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.size}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "size")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cSiz, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  size: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cDemo)}`
  s = s.replace(creativeTdEnd, placementBlock)
  return s
}

function transform(v) {
  let s = template
  const P = v.prefix
  const row = v.rowType
  const up = v.slug.toUpperCase()
  const camel =
    v.slug === "progaudio"
      ? "progAudio"
      : v.slug === "progbvod"
        ? "progBvod"
        : v.slug === "progdisplay"
          ? "progDisplay"
          : v.slug === "progvideo"
            ? "progVideo"
            : "progOoh"

  const pairs = [
    ["SocialMediaExpertScheduleRow", row],
    ["SocialMediaExpertMergedWeekSpan", "ProgExpertMergedWeekSpan"],
    [
      "deriveSocialMediaExpertRowScheduleYmdFromRow",
      "deriveProgExpertRowScheduleYmdFromRow",
    ],
    ["SocialMediaExpertGrid", `${P}ExpertGrid`],
    ["SocialMediaExpertFocusedCell", `${P}ExpertFocusedCell`],
    ["SocialMediaMultiCellSelection", `${P}MultiCellSelection`],
    ["SocialMediaCopiedCells", `${P}CopiedCells`],
    ["SocialMediaWeekRectSelection", `${P}WeekRectSelection`],
    ["SocialMediaRowMergeMap", `${P}RowMergeMap`],
    ["SocialMediaRowMergeSpanMeta", `${P}RowMergeSpanMeta`],
    ["normalizeSocialMediaKey", `normalize${P}Key`],
    ["normalizeSocialMediaPlatformPaste", v.normalizePlatformFn],
    ["normalizeSocialMediaWeekRect", `normalize${P}WeekRect`],
    [
      "SocialMediaWeekMergeSelectionNormalized",
      `${P}WeekMergeSelectionNormalized`,
    ],
    [
      "normalizeSocialMediaWeekMergeSelection",
      `normalize${P}WeekMergeSelection`,
    ],
    ["deriveSocialMediaMergeEligibility", `derive${P}MergeEligibility`],
    ["feesocial", v.fee],
    [`getMediaTypeThemeHex("socialmedia")`, `getMediaTypeThemeHex("${v.theme}")`],
  ]
  for (const [a, b] of pairs) {
    s = s.split(a).join(b)
  }

  s = s.replace(SOCIAL_BUY_BLOCK, v.buyBlock)

  s = s.replace(/normalizeSocialMediaBuyTypePaste/g, v.normalizeBuyFn)
  s = s.replace(/SOCIALMEDIA_BUY_TYPE_OPTIONS/g, v.buyConst)

  s = s.replace(/SOCIALMEDIA_/g, `${up}_`)
  s = s.replace(/socialmedia-expert/g, `${v.slug}-expert`)
  s = s.replace(/socialMedia/g, camel)

  s = s.replace(
    /Social Media — Expert Schedule/g,
    `${v.title} — Expert Schedule`
  )
  s = s.replace(/\[Social Media merge\]/g, `[${v.title} merge]`)
  s = s.replace(/id="socialmedia-expert-row-count"/g, `id="${v.slug}-expert-row-count"`)
  s = s.replace(
    /htmlFor="socialmedia-expert-row-count"/g,
    `htmlFor="${v.slug}-expert-row-count"`
  )
  s = s.replace(
    /data-socialmedia-expert-grid-scroll/g,
    `data-${v.slug}-expert-grid-scroll`
  )
  s = s.replace(
    /data-fuzzy-socialmedia-network/g,
    `data-fuzzy-${v.slug}-network`
  )

  s = s.replace(
    /createEmptySocialMediaExpertRow/g,
    `createEmpty${P}ExpertRow`
  )

  // noadserving: billing keys + widths + empty row + labels + paste + checkbox column
  const billingRe = new RegExp(
    `const ${up}_BILLING_FLAG_KEYS: readonly \\(keyof ${row}\\)\\[] = \\[\\s*` +
      `"fixedCostMedia",\\s*` +
      `"clientPaysForMedia",\\s*` +
      `"budgetIncludesFees",\\s*` +
      `\\]`,
    "m"
  )
  s = s.replace(
    billingRe,
    `const ${up}_BILLING_FLAG_KEYS: readonly (keyof ${row})[] = [
  "fixedCostMedia",
  "clientPaysForMedia",
  "budgetIncludesFees",
  "noadserving",
]`
  )

  s = s.replace(
    /descriptorColWidths = useMemo\(\s*\(\) => \[48, 48, 120, 110, 96, 120, 110, 110, 96, 40, 40, 40, 88\]/,
    "descriptorColWidths = useMemo(\n    () => [48, 48, 120, 110, 96, 120, 110, 110, 96, 40, 40, 40, 40, 88]"
  )

  s = s.replace(
    /budgetIncludesFees: false,\s*unitRate: "",/,
    "budgetIncludesFees: false,\n    noadserving: false,\n    unitRate: \"\","
  )

  s = s.replace(
    /const billing = \[\s*"Fixed cost media",\s*"Client pays for media",\s*"Budget includes fees",\s*\]/,
    `const billing = [
      "Fixed cost media",
      "Client pays for media",
      "Budget includes fees",
      "No ad serving",
    ]`
  )

  s = s.replace(
    /field === "fixedCostMedia" \|\|\s*field === "clientPaysForMedia" \|\|\s*field === "budgetIncludesFees"/,
    `field === "fixedCostMedia" ||
            field === "clientPaysForMedia" ||
            field === "budgetIncludesFees" ||
            field === "noadserving"`
  )

  const cBifBlock = `const cBif = colIndexOf("budgetIncludesFees")`

  const cBifWithNoad = `${cBifBlock}

                      const cNoad = colIndexOf("noadserving")`
  s = s.replace(cBifBlock, cBifWithNoad)

  const bifTdClose = `onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cBif,
                                        e
                                      )
                                    }
                                  />
                                </div>
                              </td>
                          <td
                            className={stickyTd(cRate)}`

  const bifPlusNoad = `onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cBif,
                                        e
                                      )
                                    }
                                  />
                                </div>
                              </td>
                              <td
                                className={stickyTd(cNoad)}
                                style={stickyStyleBody(cNoad)}
                              >
                                <div className="flex h-8 items-center justify-center">
                                  <input
                                    type="checkbox"
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cNoad
                                    )}
                                    className="h-4 w-4 rounded border"
                                    checked={row.noadserving}
                                    onChange={(e) =>
                                      updateRow(rowIndex, {
                                        noadserving: e.target.checked,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "noadserving"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cNoad,
                                        e
                                      )
                                    }
                                  />
                                </div>
                              </td>
                          <td
                            className={stickyTd(cRate)}`

  if (!s.includes(bifTdClose)) {
    throw new Error("noadserving: anchor not found")
  }
  s = s.replace(bifTdClose, bifPlusNoad)

  s = applyPlacementSize(s, v)

  return s
}

for (const v of variants) {
  const out = transform(v)
  fs.writeFileSync(
    path.join(root, "components/media-containers", v.file),
    out,
    "utf8"
  )
  console.log("wrote", v.file)
}
