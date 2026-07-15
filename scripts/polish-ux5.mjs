import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s
  s = s.replace(
    /writeContainerEntryMode\("card"\)\r?\n([ \t]*)handle/g,
    'writeContainerEntryMode("card")\n$1  handle'
  )
  s = s.replace(
    /writeContainerEntryMode\("schedule"\)\r?\n([ \t]*)open/g,
    'writeContainerEntryMode("schedule")\n$1  open'
  )
  s = s.replace(/Expert schedule open/g, "Schedule grid open")
  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("polished", file)
  }
}
