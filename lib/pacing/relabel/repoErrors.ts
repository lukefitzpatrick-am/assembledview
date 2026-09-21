export class RelabelRepoError extends Error {
  readonly code: "UNAVAILABLE" | "VALIDATION"
  constructor(code: RelabelRepoError["code"], message: string) {
    super(message)
    this.name = "RelabelRepoError"
    this.code = code
  }
}

export function isMissingRelabelTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /delivery_relabels|delivery_relabel_log|42703|42P01/i.test(message)
}

export function relabelUnavailable(): never {
  throw new RelabelRepoError("UNAVAILABLE", "delivery_relabels is not applied yet")
}
