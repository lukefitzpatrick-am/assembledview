import type AvaTool from "./types";
import { getAvaXanoSummary } from "@/lib/xano/ava";

export const getMediaPlanSummaryTool: AvaTool = {
  definition: {
    name: "get_media_plan_summary",
    description:
      "Fetch a summary of the current media plan from Xano, including client, MBA number, budget, dates, line items, and KPI benchmarks. Call this when the user asks about plan details, budget, schedule, line items, publishers, or KPIs for the current page. Only call once per conversation unless the user explicitly asks for a refresh.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  async execute(_input, context) {
    const { clientSlug, mbaNumber } = context;

    if (!clientSlug && !mbaNumber) {
      return {
        content:
          "No media plan is in scope for this page. The user is not currently viewing a specific plan.",
        isError: false,
      };
    }

    try {
      const summary = await getAvaXanoSummary({ clientSlug, mbaNumber });
      if (summary === "") {
        return {
          content:
            "The media plan summary came back empty. There may be no plan associated with this client or MBA number.",
          isError: false,
        };
      }
      return { content: summary, isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: `Failed to fetch media plan summary: ${message}`,
        isError: true,
      };
    }
  },
};
