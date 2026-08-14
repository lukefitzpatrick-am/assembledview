/** One Assign click reads only this note's dropdown — never another row. */
export function assignSubmitForRow(
  noteId: number,
  targetById: Record<number, string>,
  fallback = "",
): { noteId: number; rawTarget: string } | null {
  const raw = (targetById[noteId] ?? fallback).trim()
  if (!raw) return null
  return { noteId, rawTarget: raw }
}
