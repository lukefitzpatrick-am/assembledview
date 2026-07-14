/**
 * Finish UX-7: inject empty placeholder UI (import alone is not enough).
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")

function clearDefaultLineArray(src) {
  const formIdx = src.indexOf("useForm({")
  if (formIdx < 0) return src
  const defaultsIdx = src.indexOf("defaultValues:", formIdx)
  if (defaultsIdx < 0 || defaultsIdx - formIdx > 800) return src

  const slice = src.slice(defaultsIdx, defaultsIdx + 2500)
  const keyMatch = slice.match(/\b([a-zA-Z]*[Ll]ineItems)\s*:\s*\[/)
  if (!keyMatch) return src
  if (slice.includes(`${keyMatch[1]}: []`)) return src

  const absStart = defaultsIdx + keyMatch.index + keyMatch[0].length - 1
  let depth = 0
  let i = absStart
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++
    else if (src[i] === "]") {
      depth--
      if (depth === 0) {
        i++
        break
      }
    }
  }
  const keyStart = defaultsIdx + keyMatch.index
  return src.slice(0, keyStart) + `${keyMatch[1]}: []` + src.slice(i)
}

function injectPlaceholder(src) {
  if (src.includes("<ContainerEmptyLinesPlaceholder")) return src

  const mapNeedle = "{lineItemFields.map((field, lineItemIndex) =>"
  const mapIdx = src.indexOf(mapNeedle)
  if (mapIdx < 0) {
    console.warn("no map", "—")
    return src
  }

  const addIdx = src.lastIndexOf("Add Line Item")
  if (addIdx < 0) {
    console.warn("no Add Line Item")
    return src
  }
  const appendCall = src.lastIndexOf("appendLineItem(", addIdx)
  if (appendCall < 0) {
    console.warn("no appendLineItem")
    return src
  }
  let depth = 0
  let j = appendCall + "appendLineItem".length
  while (j < src.length && src[j] !== "(") j++
  for (; j < src.length; j++) {
    if (src[j] === "(") depth++
    else if (src[j] === ")") {
      depth--
      if (depth === 0) {
        j++
        break
      }
    }
  }
  const appendExpr = src.slice(appendCall, j)

  const placeholder = `{lineItemFields.length === 0 ? (
                  <ContainerEmptyLinesPlaceholder
                    onAdd={() => ${appendExpr}}
                  />
                ) : null}
                `

  return src.slice(0, mapIdx) + placeholder + src.slice(mapIdx)
}

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s
  s = clearDefaultLineArray(s)
  s = injectPlaceholder(s)
  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("updated", file)
  } else {
    console.log("ok", file)
  }
}
