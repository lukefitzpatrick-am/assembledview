/**
 * Quick OOXML relationship integrity check for a .pptx
 * Run: npx tsx scripts/validate-pptx-rels.ts [.claude-scratch-export.pptx]
 */
import fs from "fs"
import path from "path"
import JSZip from "jszip"

async function main() {
  const pptxPath = path.resolve(
    process.cwd(),
    process.argv[2] || ".claude-scratch-export.pptx"
  )
  const pptx = fs.readFileSync(pptxPath)
  const zip = await JSZip.loadAsync(pptx)
  const names = Object.keys(zip.files)
    .filter((n) => !zip.files[n]!.dir)
    .sort()

  const broken: string[] = []
  const relFiles = names.filter((n) => n.endsWith(".rels"))
  for (const relPath of relFiles) {
    const xml = await zip.file(relPath)!.async("string")
    const baseDir = path.posix.dirname(relPath)
    const targets = [...xml.matchAll(/Target="([^"]+)"/g)].map((m) => m[1]!)
    for (const t of targets) {
      if (/^(https?:|mailto:)/i.test(t)) continue
      const from = baseDir.endsWith("_rels") ? path.posix.dirname(baseDir) : baseDir
      let resolved = path.posix.normalize(path.posix.join(from, t))
      if (resolved.startsWith("/")) resolved = resolved.slice(1)
      if (!zip.files[resolved]) {
        broken.push(`${relPath} -> ${t} (resolved ${resolved})`)
      }
    }
  }

  const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  const charts = names.filter((n) => n.includes("/charts/"))
  console.log(`file: ${pptxPath}`)
  console.log(`parts: ${names.length}`)
  console.log(
    `slides: ${slides.length} (${slides.map((s) => s.replace("ppt/slides/", "")).join(", ")})`
  )
  console.log(`chart parts: ${charts.length}`)
  console.log(`broken relationships: ${broken.length}`)
  if (broken.length) {
    console.log(broken.slice(0, 50).join("\n"))
    if (broken.length > 50) console.log(`... and ${broken.length - 50} more`)
    process.exit(1)
  }
  console.log("OOXML relationship check: PASS")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
