/**
 * Check the code-execution container paths the Assembled pptx skill names.
 *
 * node --env-file=.env.local --import tsx scripts/spikes/report-deck-skill/probe-container.ts
 */
import Anthropic from "@anthropic-ai/sdk"
import { reportModel, SPIKE_BETAS, spikeClient } from "./spike-client"

function textOf(content: Anthropic.Beta.BetaMessage["content"]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === "text") parts.push(block.text)
    if (block.type === "code_execution_tool_result" && block.content.type === "code_execution_result") {
      parts.push(block.content.stdout)
      if (block.content.stderr) parts.push(block.content.stderr)
    }
    if (block.type === "bash_code_execution_tool_result" && block.content.type === "bash_code_execution_result") {
      parts.push(block.content.stdout)
      if (block.content.stderr) parts.push(block.content.stderr)
    }
  }
  return parts.join("\n")
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is missing")
    process.exitCode = 1
    return
  }
  const client = spikeClient()
  const response = await client.beta.messages.create({
    model: reportModel(),
    max_tokens: 4000,
    betas: [...SPIKE_BETAS],
    tools: [{ type: "code_execution_20250825", name: "code_execution" }],
    container: {
      skills: [{ type: "anthropic", skill_id: "pptx", version: "latest" }],
    },
    messages: [
      {
        role: "user",
        content:
          "Use code execution only. Do not build a deck. Print exists/missing for each path: /mnt/skills/public/pptx/SKILL.md, /mnt/user-data/outputs/. Also print `which soffice` (or missing), list /mnt if it exists, and print the directory where this container expects finished files to be written. Reply with the raw command output.",
      },
    ],
  })
  console.log(
    JSON.stringify(
      {
        stop_reason: response.stop_reason,
        container_id: response.container?.id ?? null,
        model: response.model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      null,
      2,
    ),
  )
  console.log("---")
  console.log(textOf(response.content))
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(message)
  process.exitCode = 1
})
