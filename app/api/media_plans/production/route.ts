import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export const GET = createChannelLineItemsGetHandler(
  "media_plan_production",
  "PRODUCTION"
);
