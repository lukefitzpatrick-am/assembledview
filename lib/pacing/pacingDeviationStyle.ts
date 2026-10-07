import { DEVIATION_TONE, TONE_TEXT } from "@/lib/design/status"

export function pacingDeviationSparklineClass(pacingPct: number): string {
  const d = Math.abs(Number(pacingPct) - 100)
  return TONE_TEXT[DEVIATION_TONE(d)]
}
