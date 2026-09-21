export type RelabelDriftFinding = {
  code: string
  message: string
  mbaNumber?: string
}

/**
 * R4 warehouse drift vs delivery_relabels. Not wired yet — fail-soft empty
 * so the 7am digest section still renders.
 */
export async function listRelabelDrift(): Promise<RelabelDriftFinding[]> {
  return []
}
