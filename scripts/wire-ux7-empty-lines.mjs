/**
 * UX-7: replace auto-created empty lineItems[0] with [] and inject empty placeholder.
 * Run: node scripts/wire-ux7-empty-lines.mjs
 */
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")
const IMPORT =
  'import { ContainerEmptyLinesPlaceholder } from "@/components/media-containers/ContainerEmptyLinesPlaceholder"\n'

function clearDefaultLineArray(src) {
  // Match `fooItems: [` or `lineItems: [` right after defaultValues and empty the array
  // of a single starter object. Heuristic: first `XxxlineItems: [` / `lineItems: [` /
  // `productionlineItems` inside useForm({ defaultValues
  const formIdx = src.indexOf("useForm({")
  if (formIdx < 0) return src
  const defaultsIdx = src.indexOf("defaultValues:", formIdx)
  if (defaultsIdx < 0 || defaultsIdx - formIdx > 800) return src

  // End of defaultValues object: look for `},\n  });` pattern near schema
  const resolverBefore = src.lastIndexOf("resolver:", formIdx + 1)
  // Find array key inside defaultValues
  const slice = src.slice(defaultsIdx, defaultsIdx + 2500)
  const keyMatch = slice.match(
    /\b([a-zA-Z]*lineItems)\s*:\s*\[/
  )
  if (!keyMatch) return src

  const key = keyMatch[1]
  const absStart = defaultsIdx + keyMatch.index + keyMatch[0].length - 1 // at '['
  // Walk brackets from absStart
  let depth = 0
  let i = absStart
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
  const absEnd = i // after ]
  const replacement = `${key}: []`
  // Include from key start
  const keyStart = defaultsIdx + keyMatch.index
  return src.slice(0, keyStart) + replacement + src.slice(absEnd)
}

function injectEmptyPlaceholder(src) {
  if (src.includes("ContainerEmptyLinesPlaceholder")) return src

  // After `{lineItemFields.map(`  or before the map — insert when length===0
  // Pattern: `{lineItemFields.map((field, lineItemIndex) => {`
  const mapRe = /(\{)(lineItemFields\.map\(\(field,\s*lineItemIndex\)\s*=>\s*\{)/
  if (!mapRe.test(src)) {
    // Production may differ
    const alt = /(\{)((\w*[Ff]ields)\.map\(\(field,\s*lineItemIndex\)\s*=>\s*\{)/
    if (!alt.test(src)) {
      console.warn("no map for empty placeholder")
      return src
    }
  }

  // Find appendLineItem block template from last Add Line Item onClick — reuse via calling
  // a placeholder that needs onAdd. We'll inject:
  // {lineItemFields.length === 0 ? (
  //   <ContainerEmptyLinesPlaceholder onAdd={() => appendLineItem({...})} />
  // ) : null}
  // Extract template from existing appendLineItem({ ... }) near "Add Line Item"

  const addIdx = src.lastIndexOf("Add Line Item")
  if (addIdx < 0) {
    console.warn("no Add Line Item button")
    return src
  }
  // Walk back to appendLineItem(
  const appendCall = src.lastIndexOf("appendLineItem(", addIdx)
  if (appendCall < 0) {
    console.warn("no appendLineItem near Add")
    return src
  }
  // Capture from appendLineItem( to matching )
  let depth = 0
  let j = appendCall + "appendLineItem".length
  // find (
  while (j < src.length && src[j] !== "(") j++
  const startParen = j
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

  const fieldsNameMatch = src.match(/fields:\s*lineItemFields/) || src.match(/fields:\s*(\w+)/)
  const fieldsName = fieldsNameMatch && fieldsNameMatch[1] ? fieldsNameMatch[1] : "lineItemFields"
  // Actually useFieldArray returns fields: lineItemFields
  const fieldsAlias = (src.match(/fields:\s*(lineItemFields)/) || ["", "lineItemFields"])[1]

  const placeholder = `
                {${fieldsAlias}.length === 0 ? (
                  <ContainerEmptyLinesPlaceholder
                    onAdd={() => ${appendExpr}}
                  />
                ) : null}
                `

  // Insert just before the map
  return src.replace(
    /(\n\s*)(\{lineItemFields\.map\(\(field,\s*lineItemIndex\)\s*=>)/,
    `$1${placeholder}$1$2`
  )
}

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  if (!s.includes("ContainerEmptyLinesPlaceholder")) {
    s = s.replace('"use client"\n\n', `"use client"\n\n${IMPORT}`)
  }

  s = clearDefaultLineArray(s)
  s = injectEmptyPlaceholder(s)

  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("updated", file)
  } else {
    console.log("no change", file)
  }
}
