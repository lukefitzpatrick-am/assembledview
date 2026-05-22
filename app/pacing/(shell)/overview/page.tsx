import { Suspense } from "react";
import { OverviewClient } from "./OverviewClient";

export default function PacingOverviewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <OverviewClient />
    </Suspense>
  );
}
