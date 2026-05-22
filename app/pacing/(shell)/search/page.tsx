import { Suspense } from "react";
import { CampaignsClient } from "./CampaignsClient";

export default function PacingCampaignsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <CampaignsClient />
    </Suspense>
  );
}
