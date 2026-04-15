import type Anthropic from "@anthropic-ai/sdk";
import type AvaTool from "./types";
import { applyFormPatchTool } from "./applyFormPatch";
import { getMediaPlanSummaryTool } from "./getMediaPlanSummary";

const AVA_TOOLS: AvaTool[] = [getMediaPlanSummaryTool, applyFormPatchTool];

export const AVA_TOOL_DEFINITIONS: Anthropic.Tool[] = AVA_TOOLS.map(
  (t) => t.definition,
);

const toolsByName = new Map<string, AvaTool>(
  AVA_TOOLS.map((t) => [t.definition.name, t]),
);

export function getToolByName(name: string): AvaTool | undefined {
  return toolsByName.get(name);
}
