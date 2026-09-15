export function keepPartnerAttachment(att: {
  name?: string | null
  contentType?: string | null
  isInline?: boolean | null
}): boolean {
  if (att.isInline) return false
  const type = String(att.contentType ?? "").toLowerCase()
  if (type.startsWith("image/")) return false
  const name = String(att.name ?? "").trim()
  return /\.(xlsx|csv|zip)$/i.test(name)
}
