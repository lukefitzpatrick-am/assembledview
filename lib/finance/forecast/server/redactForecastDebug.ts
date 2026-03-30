import type { FinanceForecastDataset, FinanceForecastLine } from "@/lib/types/financeForecast"

/**
 * When `debug` query mode is off, strip row-level QA fields to keep payloads smaller.
 * `source` is retained for normal provenance; only `debug` is removed.
 */
export function redactForecastRowDebug(dataset: FinanceForecastDataset): FinanceForecastDataset {
  const client_blocks = dataset.client_blocks.map((block) => ({
    ...block,
    groups: block.groups.map((g) => ({
      ...g,
      lines: g.lines.map(redactLine),
    })),
  }))
  return { ...dataset, client_blocks }
}

function redactLine(line: FinanceForecastLine): FinanceForecastLine {
  const { debug: _d, ...rest } = line
  return rest
}
