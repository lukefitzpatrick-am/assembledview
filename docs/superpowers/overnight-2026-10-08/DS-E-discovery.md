# DS-E discovery

PDF: `lib/generateMBA.ts`, `lib/generateBillingSchedulePDF.ts`, `lib/generateScopeOfWork.ts`. Logo also fetched from `app/mediaplans/create/page.tsx`, `app/mediaplans/mba/[mba_number]/edit/page.tsx`, `lib/docs/renderDraftDocuments.ts`, `lib/docs/buildMediaItemsFromPersisted.ts`. Routes: `app/api/mba/generate/route.ts`, `app/api/scopes-of-work/generate-pdf/route.ts`. Tracing: `next.config.mjs` `outputFileTracingIncludes`.

Fonts: `lib/pdf/fonts/src/*`, `scripts/brand/build-pdf-fonts.mjs` → `lib/pdf/fonts/plusJakartaSans.ts`, `lib/pdf/brandPdf.ts`.

Excel: `lib/generateMediaPlan.ts` (gantt, KPI sheet, section fills), `lib/billing/exportBillingScheduleExcel.ts`, `lib/finance/report/exportReportExcel.ts`. Stamp expectations: `lib/docs/__tests__/draftStamp.test.ts`, `lib/docs/__tests__/renderDraftDocuments.test.ts`.

Email: `lib/email/inviteSender.ts`, `lib/creative/uploadDigestEmail.ts`, `lib/ops/digest/email.ts`, `lib/ops/health/email.ts`, `lib/pacing/relabel/notify.ts`.

Samples: `scripts/brand/render-sample-exports.ts`. Test: `lib/pdf/__tests__/brandPdf.test.ts`.
