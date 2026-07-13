import type { ChatFileAttachment } from "@/lib/ava/types"

/** Build a generic chat file attachment (reusable by any export tool). */
export function toChatFileAttachment(input: {
  fileName: string
  url: string
  contentType: string
  sizeBytes?: number
  expiresInMinutes?: number
}): ChatFileAttachment {
  const attachment: ChatFileAttachment = {
    kind: "file",
    fileName: input.fileName,
    url: input.url,
    contentType: input.contentType,
  }
  if (typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes) && input.sizeBytes >= 0) {
    attachment.sizeBytes = input.sizeBytes
  }
  if (
    typeof input.expiresInMinutes === "number" &&
    Number.isFinite(input.expiresInMinutes) &&
    input.expiresInMinutes > 0
  ) {
    attachment.expiresInMinutes = input.expiresInMinutes
  }
  return attachment
}

export function isChatFileAttachment(value: unknown): value is ChatFileAttachment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    v.kind === "file" &&
    typeof v.fileName === "string" &&
    v.fileName.length > 0 &&
    typeof v.url === "string" &&
    v.url.length > 0 &&
    typeof v.contentType === "string" &&
    v.contentType.length > 0
  )
}

export function coerceChatFileAttachments(value: unknown): ChatFileAttachment[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const out = value.filter(isChatFileAttachment)
  return out.length > 0 ? out : undefined
}
