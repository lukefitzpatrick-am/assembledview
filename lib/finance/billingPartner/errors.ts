export class BillingPartnerPackError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "BillingPartnerPackError"
    this.status = status
  }
}
