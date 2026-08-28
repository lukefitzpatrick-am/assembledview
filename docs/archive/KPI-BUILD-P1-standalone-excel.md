# BUILD P1 — Standalone KPI Excel in "Save & Download All"

**Goal:** Add a standalone `Campaign KPIs` .xlsx as its own file inside the Save & Download All zip, on BOTH the create page and the edit page. Reuse the existing `addKPISheet` builder on a fresh workbook. One logical change.

**Confidence: 92%.** The one risk is empty `kpiRows` at save time (see Robustness note) — that does not block this change, it just determines whether you also want the follow-up guard.

## Context (already verified — do not re-investigate)
- `addKPISheet(workbook, kpiRows)` in `lib/generateMediaPlan.ts` is self-contained: it adds a `"Campaign KPIs"` worksheet and returns void. It no-ops if rows are empty.
- The exact `ResolvedKPIRow → KPISheetRow` mapping already exists in the create page at the standard-workbook path (`app/mediaplans/create/page.tsx` ~line 2654). Copy that mapping verbatim.
- Both pages' `handleSaveAndDownloadAll` build three blobs, then `zip.file(...)` each, then `saveAs(zipBlob, ...)`.
- **Field-name gotcha:** create page reads `fv.mp_client_name`; edit page reads `fv.mp_clientname`. Use the one already present in each file for the filename.
- `kpiRows` is component state (`ResolvedKPIRow[]`) and is in scope inside both handlers.

## Change — create page (`app/mediaplans/create/page.tsx`)
Inside `handleSaveAndDownloadAll` (starts ~line 5273), AFTER the existing three-blob `Promise.all` and BEFORE `saveAs(zipBlob, ...)`, add a standalone KPI workbook and zip it:

```ts
// Standalone KPI workbook (only when KPI rows exist)
if (kpiRows.length > 0) {
  const ExcelJS = (await import("exceljs")).default;
  const { addKPISheet } = await import("@/lib/generateMediaPlan");
  const kpiWorkbook = new ExcelJS.Workbook();
  addKPISheet(
    kpiWorkbook,
    kpiRows.map((r) => ({
      mediaType: r.media_type,
      publisher: r.publisher,
      label: r.lineItemLabel,
      buyType: r.buyType,
      spend: r.spend,
      deliverables: r.deliverables,
      ctr: r.ctr,
      vtr: r.vtr,
      cpv: r.cpv,
      conversion_rate: r.conversion_rate,
      frequency: r.frequency,
      calculatedClicks: r.calculatedClicks,
      calculatedViews: r.calculatedViews,
      calculatedReach: r.calculatedReach,
    })),
  );
  const kpiArrayBuffer = await kpiWorkbook.xlsx.writeBuffer();
  const kpiBlob = new Blob([kpiArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const kpiFileName = `KPIs_${fv.mp_campaignname || "campaign"}.xlsx`;
  zip.file(kpiFileName, kpiBlob);
}
```
Place this block immediately after the existing `zip.file(namingFileName, namingBlob);` line (and before `zip.generateAsync`).

Confirm the ExcelJS import style matches the rest of the file. If the file already imports `ExcelJS` at top-level, use that instead of the dynamic import (check existing `generateMediaPlanXlsxBlob` — it uses the same `workbook.xlsx.writeBuffer()` pattern, so ExcelJS is definitely available; match its import).

## Change — edit page (`app/mediaplans/mba/[mba_number]/edit/page.tsx`)
Same block inside its `handleSaveAndDownloadAll` (starts ~line 6575), after `zip.file(namingFileName, namingBlob);`. Use the SAME mapping. Filename uses `fv.mp_campaignname` (campaign field is the same on both pages).

## Robustness note (decide, do not auto-build)
`kpiRows` is populated by a 600ms debounced resolver. If the user clicks Save & Download All immediately after editing line items, `kpiRows` may be stale/empty and the KPI file would be skipped. The media-plan tab has the same gate. Two options for a follow-up commit if you see this in smoke:
- (a) Re-resolve KPIs synchronously inside the handler via `resolveAllKPIs(...)` using current inputs, or
- (b) Disable the button until the debounce settles.
Leave as-is for P1; raise after smoke.

## Gate & smoke (before any commit)
1. `npx tsc --noEmit` → must return the known 4-error baseline, no new errors.
2. Browser smoke (create page): add ≥1 line item with a buy type, wait for KPI rows to appear in the KPI panel, click **Save & Download All**, open the zip → confirm a `KPIs_<campaign>.xlsx` file is present AND opens with the grouped Campaign KPIs layout populated.
3. Repeat smoke on the edit page for an existing plan.
4. Confirm the media-plan workbook still contains its own `Campaign KPIs` tab (unchanged).

## Commit (only after smoke passes)
```powershell
git add "app/mediaplans/create/page.tsx"
git add "app/mediaplans/mba/[mba_number]/edit/page.tsx"
git commit -m "feat(kpi): add standalone KPI workbook to Save & Download All zip"
```
Do not push. Report tsc output + zip contents back.
