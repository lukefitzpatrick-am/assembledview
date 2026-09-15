function isoDay(receivedAt: string): string {
  const day = receivedAt.trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  return new Date().toISOString().slice(0, 10)
}

function safeMessageId(internetMessageId: string): string {
  return internetMessageId.replace(/[<>]/g, "").replace(/[/\\]/g, "_")
}

/** RAW.PARTNER_* SOURCE_FILE: `{slug}/{yyyy-mm-dd}/{internetMessageId}_{name}` */
export function partnerSourceFile(input: {
  sourceSlug: string
  receivedAt: string
  internetMessageId: string
  attachmentName: string
}): string {
  const id = safeMessageId(input.internetMessageId || "unknown")
  const name = input.attachmentName.replace(/[/\\]/g, "_")
  return `${input.sourceSlug}/${isoDay(input.receivedAt)}/${id}_${name}`
}
