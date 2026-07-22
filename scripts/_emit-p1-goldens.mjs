import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const d = JSON.parse(readFileSync(join(process.cwd(), "dump_p1.json"), "utf8"))
const body = `/** Frozen output of mapRadioExpertRowsToStandardLineItems (feePctRadio: 10). */
const RADIO_GOLDEN = ${JSON.stringify(d.radio, null, 2)}

/** Frozen output of mapCinemaExpertRowsToStandardLineItems (feePctCinema: 10). */
const CINEMA_GOLDEN = ${JSON.stringify(d.cinema, null, 2)}

/** Frozen output of mapDigiVideoExpertRowsToStandardLineItems (feePctDigiVideo: 10). */
const DIGI_VIDEO_GOLDEN = ${JSON.stringify(d.digiVideo, null, 2)}
`
writeFileSync(join(process.cwd(), "p1_goldens_snippet.ts"), body, "utf8")
console.log("wrote p1_goldens_snippet.ts", body.length)
