export {
  buildSnapshotHeader,
  buildSnapshotLinesFromDataset,
  buildSnapshotStagingPayload,
  buildSourceVersionSummaryJson,
  type BuildSnapshotPayloadParams,
  type SnapshotApiMetaLike,
  type SnapshotSourceAuditFields,
} from "./buildSnapshotPayload"
export { formatAutomatedSnapshotLabel, scenarioDisplayLabel } from "./labels"
export { checkSnapshotDuplicateGuard, recordSnapshotDedupeGuard } from "./duplicateGuard"
export {
  compareFinanceForecastSnapshotLines,
  compareSnapshotsByClient,
  compareSnapshotsByLineCategory,
  compareSnapshotsByMonth,
  indexSnapshotLinesByComparisonKey,
  normaliseMediaPlanVersionId,
  snapshotLineComparisonKey,
  toComparisonKey,
} from "./compareSnapshotLines"
export { hashFinanceForecastDataset, hashFinanceForecastLineForSnapshot, stableStringify } from "./serializeForSnapshotHash"
export {
  classifyFinanceForecastVariance,
  compareFinanceForecastSnapshots,
  financeForecastVariancePercentChange,
} from "./varianceEngine"
