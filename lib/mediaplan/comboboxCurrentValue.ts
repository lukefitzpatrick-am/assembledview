import type { ComboboxOption } from "@/components/ui/combobox"

/**
 * Ensures a saved field value remains selectable/renderable when the options
 * list is empty or still loading (e.g. publishers fetch in flight after the
 * card body has already painted).
 */
export function withInjectedComboboxValue(
  options: readonly ComboboxOption[],
  current: string | null | undefined
): ComboboxOption[] {
  const trimmed = String(current ?? "").trim()
  if (!trimmed) return [...options]
  if (options.some((o) => o.value === trimmed)) return [...options]
  return [{ value: trimmed, label: trimmed }, ...options]
}
