import type Anthropic from "@anthropic-ai/sdk";
import type AvaTool from "./types";
import { AVA_TOOL_NAMES } from "./summaries";
import { applyFormPatchTool } from "./applyFormPatch";
import { getMediaPlanSummaryTool } from "./getMediaPlanSummary";
import { getClientDetailsTool } from "./getClientDetails";
import { getCampaignContextTool } from "./getCampaignContext";
import { getSavedAudiencesTool } from "./getSavedAudiences";
import { getBestPracticeTool } from "./getBestPractice";
import { getNamingRulesTool } from "./getNamingRules";
import { getCreativeAssetsTool } from "./getCreativeAssets";
import { getMethodologyTool } from "./getMethodology";
import { getPacingSnapshotTool } from "./getPacingSnapshot";
import { getDeliverySnapshotTool } from "./getDeliverySnapshot";
import { getPlatformSpecsTool } from "./getPlatformSpecs";
import { startMiInterviewTool } from "./startMiInterview";
import { generateMiWorkbookTool } from "./generateMiWorkbook";
import { loadSkillTool } from "./loadSkill";
import { generatePerformanceReportTool } from "./generatePerformanceReport";

const AVA_TOOLS: AvaTool[] = [
  getMediaPlanSummaryTool,
  applyFormPatchTool,
  getClientDetailsTool,
  getCampaignContextTool,
  getSavedAudiencesTool,
  getBestPracticeTool,
  getNamingRulesTool,
  getCreativeAssetsTool,
  getMethodologyTool,
  getPacingSnapshotTool,
  getDeliverySnapshotTool,
  getPlatformSpecsTool,
  startMiInterviewTool,
  generateMiWorkbookTool,
  loadSkillTool,
  generatePerformanceReportTool,
];

const registeredNames = AVA_TOOLS.map((t) => t.definition.name);
if (
  registeredNames.length !== AVA_TOOL_NAMES.length ||
  registeredNames.some((name, i) => name !== AVA_TOOL_NAMES[i])
) {
  throw new Error(
    `AVA tool registry out of sync with AVA_TOOL_NAMES.\nregistered=${registeredNames.join(",")}\ncatalog=${AVA_TOOL_NAMES.join(",")}`,
  );
}

export const AVA_TOOL_DEFINITIONS: Anthropic.Tool[] = AVA_TOOLS.map(
  (t) => t.definition,
);

const toolsByName = new Map<string, AvaTool>(
  AVA_TOOLS.map((t) => [t.definition.name, t]),
);

export function getToolByName(name: string): AvaTool | undefined {
  return toolsByName.get(name);
}

/** Exported for registry integrity tests. */
export function listAvaTools(): AvaTool[] {
  return [...AVA_TOOLS];
}
