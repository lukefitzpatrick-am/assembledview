import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const CHECK_DECK = path.join(here, "av-campaign-report-v5", "scripts", "check_deck.py")

export type StrayFigure = {
  slide: string
  raw: string
  normalised: string
}

/** The number check lives in check_deck.py. This calls that function. */
export async function checkDeckNumbers(
  pptxPath: string,
  jsonPath: string,
): Promise<{ stray: StrayFigure[]; slideCount: number }> {
  const { stdout } = await execFileAsync("python", [CHECK_DECK, "--numbers", pptxPath, jsonPath], {
    maxBuffer: 8 * 1024 * 1024,
  })
  return JSON.parse(stdout) as { stray: StrayFigure[]; slideCount: number }
}
