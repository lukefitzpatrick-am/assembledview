/**
 * Create or update the av-campaign-report custom skill.
 *
 * node --env-file=.env.local --import tsx scripts/spikes/report-deck-skill/upload-skill.ts
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { toFile } from "@anthropic-ai/sdk"
import { spikeClient } from "./spike-client"

const here = path.dirname(fileURLToPath(import.meta.url))
const skillDir = path.join(here, "av-campaign-report")
const DISPLAY_TITLE = "av-campaign-report"

function skillPaths(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...skillPaths(full))
    else found.push(full)
  }
  return found
}

async function main() {
  const client = spikeClient()
  const uploads = await Promise.all(
    skillPaths(skillDir)
      .filter((full) => path.basename(full) !== "assembled-template.pptx")
      .map((full) => {
        const rel = path.relative(skillDir, full).split(path.sep).join("/")
        return toFile(fs.readFileSync(full), `${DISPLAY_TITLE}/${rel}`)
      }),
  )
  console.log(JSON.stringify({
    omitted: "assets/assembled-template.pptx",
    reason: "bundling the 16MB template made the prompt 1177171 tokens, over the 1000000 limit",
  }))

  let skillId: string | null = null
  for await (const skill of client.beta.skills.list({ betas: ["skills-2025-10-02"] })) {
    if (skill.display_title === DISPLAY_TITLE) skillId = skill.id
  }

  if (skillId) {
    // versions.create strips directory names in this SDK, so SKILL.md would not
    // stay at the top-level folder. Delete the versions, then replace the skill.
    for await (const version of client.beta.skills.versions.list(skillId, { betas: ["skills-2025-10-02"] })) {
      await client.beta.skills.versions.delete(version.version, {
        skill_id: skillId,
        betas: ["skills-2025-10-02"],
      })
    }
    await client.beta.skills.delete(skillId, { betas: ["skills-2025-10-02"] })
  }

  const created = await client.beta.skills.create({
    display_title: DISPLAY_TITLE,
    files: uploads,
    betas: ["skills-2025-10-02"],
  })
  console.log(JSON.stringify({ skill_id: created.id, version: created.latest_version, action: skillId ? "replaced" : "created" }))
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
