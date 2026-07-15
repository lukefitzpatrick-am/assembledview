import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")

function emptyFirstLineItemsArray(src) {
  // Find defaultValues block's first *lineItems: [ ... ]
  const dv = src.indexOf("defaultValues:")
  if (dv < 0) return src
  const sliceStart = dv
  const slice = src.slice(sliceStart, sliceStart + 4000)
  const m = slice.match(/\b([a-zA-Z]*[Ll]ineItems)\s*:\s*\[/)
  if (!m) return src
  if (/^\s*\]/.test(slice.slice(m.index + m[0].length))) return src // already []

  const absBracket = sliceStart + m.index + m[0].length - 1
  let depth = 0
  let i = absBracket
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === "[") depth++
    else if (ch === "]") {
      depth--
      if (depth === 0) {
        i++
        break
      }
    }
  }
  return src.slice(0, sliceStart + m.index) + `${m[1]}: []` + src.slice(i)
}

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s
  s = emptyFirstLineItemsArray(s)
  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("emptied", file)
  } else {
    console.log("skip", file)
  }
}
