/** Ingest-side failure that must fail one file, never the whole run. */
export class PartnerIngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PartnerIngestError"
  }
}
