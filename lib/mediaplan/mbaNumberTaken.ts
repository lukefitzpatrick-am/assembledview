import { allocateNextMbaNumber } from "@/lib/mediaplan/allocateNextMbaNumber"

/** Thrown by createMediaPlan when POST /api/mediaplans returns MBA_NUMBER_TAKEN. */
export class CreateMediaPlanError extends Error {
  code?: string
  nextMbaNumber?: string

  constructor(
    message: string,
    extras?: { code?: string; nextMbaNumber?: string },
  ) {
    super(message)
    this.name = "CreateMediaPlanError"
    this.code = extras?.code
    this.nextMbaNumber = extras?.nextMbaNumber
  }
}

/**
 * Client identifier is the allocated number with the trailing digit run removed.
 * `penfold023` → `penfold`. A number with no prefix cannot be reallocated.
 */
export function mbaIdentifierFromAllocatedNumber(mbaNumber: string): string | null {
  const trimmed = String(mbaNumber ?? "").trim()
  const match = trimmed.match(/^(.*?)(\d+)$/)
  const identifier = match?.[1]?.trim() ?? ""
  if (!identifier) return null
  return identifier
}

/** Next number from the same allocator the create page uses. Null when the prefix cannot be read. */
export function nextMbaNumberAfterTaken(
  existingMbaNumbers: readonly (string | null | undefined)[],
  takenMbaNumber: string,
): string | null {
  const identifier = mbaIdentifierFromAllocatedNumber(takenMbaNumber)
  if (!identifier) return null
  return allocateNextMbaNumber(existingMbaNumbers, identifier)
}

/**
 * One retry when a new master collides. A second collision, or any other error, stays an error.
 */
export function mbaNumberTakenRetry(args: {
  code: string | undefined
  nextMbaNumber: string | undefined
  alreadyRetried: boolean
}): { action: "retry"; nextMbaNumber: string } | { action: "error" } {
  if (args.alreadyRetried) return { action: "error" }
  if (args.code !== "MBA_NUMBER_TAKEN") return { action: "error" }
  const next = args.nextMbaNumber?.trim() ?? ""
  if (!next) return { action: "error" }
  return { action: "retry", nextMbaNumber: next }
}

/**
 * B10 (B8 review notes, finding 1): the first save hit MBA_NUMBER_TAKEN and
 * the server sent no usable replacement (it can't read an identifier from a
 * number such as `000003` for identifier `000`). The create page then fetches
 * a fresh number from the normal allocator instead of failing the same way on
 * every Save. A second collision after a retry stays a plain error.
 */
export function mbaNumberTakenWithoutReplacement(args: {
  code: string | undefined
  nextMbaNumber: string | undefined
  alreadyRetried: boolean
}): boolean {
  if (args.alreadyRetried) return false
  if (args.code !== "MBA_NUMBER_TAKEN") return false
  return !(args.nextMbaNumber?.trim() ?? "")
}
