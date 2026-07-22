const fs = require("fs")
const p = "lib/mediaplan/expertGridChannelConfig.ts"
let s = fs.readFileSync(p, "utf8")
const marker = "export const DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG"
const i = s.indexOf(marker)
if (i < 0) throw new Error("no digidisplay")
const j = s.indexOf("export const DIGIVIDEO_BUY_TYPE_OPTIONS", i)
const chunk = s.slice(i, j)
const next = chunk.replace(
  'label: "Creative Targeting"',
  'label: "Targeting"'
)
if (chunk === next) throw new Error("no replace")
s = s.slice(0, i) + next + s.slice(j)
fs.writeFileSync(p, s)
console.log("DigiDisplay Targeting label OK")
