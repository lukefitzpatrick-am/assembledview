/**
 * List the custom skills on the API key, so you can check which DECK_SKILL_ID is the v5 deck.
 *
 * node --env-file=.env.local --import tsx scripts/spikes/report-deck-skill/list-skills.ts
 */
import { spikeClient } from "./spike-client"

async function main() {
  const client = spikeClient()
  for await (const skill of client.beta.skills.list({ betas: ["skills-2025-10-02"] })) {
    console.log(JSON.stringify({ id: skill.id, title: skill.display_title, latest_version: skill.latest_version, created_at: skill.created_at }))
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
