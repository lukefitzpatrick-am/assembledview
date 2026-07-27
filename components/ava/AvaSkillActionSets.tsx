"use client"

import { AvaSkillAction } from "@/components/ava/AvaSkillAction"

/** Shared prewired messages for Ava skill action buttons (visible in chat). */
export const AVA_SKILL_MESSAGES = {
  createMi:
    "Start the material instructions interview for this plan.",
  draftCopy:
    "Draft ad copy for this plan's channels — pick the right copy skill per channel.",
  planRationale:
    "Write the planning rationale for this plan the Assembled way.",
  writeCommentary:
    "Write delivery commentary for what's on this pacing view.",
  writeCampaignCommentary:
    "Write delivery commentary for this campaign — ground in page context and tools, no invented numbers.",
  campaignRead:
    "Give me a proactive read on this campaign's delivery: what's going well, what's off-track, and the single most useful next action. Use get_delivery_snapshot (and get_pacing_snapshot if needed), ground every claim in a tool, cite the surface, and never invent numbers. ≤120 words.",
  findInsight:
    "Find the audience insight and planning theme for the audience(s) on screen.",
  draftCopyAsset:
    "Draft copy to pair with the selected creative — choose skill by its platform.",
  videoScript:
    "Write a short-form video script for this campaign.",
} as const

export function createClientBrainMessage(clientName: string): string {
  const name = clientName.trim() || "this client"
  return `Create the marketing brain for ${name}`
}

export function AvaCreateClientBrainAction({
  clientName,
  className,
}: {
  clientName: string
  className?: string
}) {
  return (
    <AvaSkillAction
      label="Create brain"
      message={createClientBrainMessage(clientName)}
      className={className}
    />
  )
}

export function AvaMediaplanCreateActions() {
  return (
    <>
      <AvaSkillAction label="Create MI for Specs" message={AVA_SKILL_MESSAGES.createMi} />
      <AvaSkillAction label="Plan rationale" message={AVA_SKILL_MESSAGES.planRationale} />
    </>
  )
}

export function AvaMediaplanEditActions() {
  return (
    <>
      <AvaSkillAction label="Create MI for Specs" message={AVA_SKILL_MESSAGES.createMi} />
      <AvaSkillAction label="Draft ad copy" message={AVA_SKILL_MESSAGES.draftCopy} />
      <AvaSkillAction label="Plan rationale" message={AVA_SKILL_MESSAGES.planRationale} />
    </>
  )
}

export function AvaPacingCommentaryAction() {
  return (
    <AvaSkillAction label="Write commentary" message={AVA_SKILL_MESSAGES.writeCommentary} />
  )
}

export function AvaCampaignCommentaryAction() {
  return (
    <AvaSkillAction
      label="Write commentary"
      message={AVA_SKILL_MESSAGES.writeCampaignCommentary}
      className="h-9 min-w-[7.5rem] justify-center rounded-pill border-border bg-card shadow-e0"
    />
  )
}

export function AvaCampaignReadAction() {
  return (
    <AvaSkillAction
      label="Get AVA's read"
      message={AVA_SKILL_MESSAGES.campaignRead}
      className="h-9 min-w-[7.5rem] justify-center rounded-pill border-border bg-card shadow-e0"
    />
  )
}

export function AvaPlanningInsightAction() {
  return (
    <AvaSkillAction label="Find the insight" message={AVA_SKILL_MESSAGES.findInsight} />
  )
}

export function AvaCreativeSkillActions() {
  return (
    <>
      <AvaSkillAction
        label="Draft copy for this asset"
        message={AVA_SKILL_MESSAGES.draftCopyAsset}
      />
      <AvaSkillAction label="Video script" message={AVA_SKILL_MESSAGES.videoScript} />
    </>
  )
}
