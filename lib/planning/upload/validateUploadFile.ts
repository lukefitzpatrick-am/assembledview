export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = new Set([".xlsx", ".xlsm"])

export function validateUploadFile(file: {
  name: string
  size: number
} | null): string | null {
  if (!file) return "Exactly one file is required"
  const name = file.name.trim()
  if (!name) return "File name is required"
  const dot = name.lastIndexOf(".")
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : ""
  if (!ALLOWED_EXT.has(ext)) {
    return "File must be .xlsx or .xlsm"
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "File is empty"
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File must be 10 MB or smaller"
  }
  return null
}
