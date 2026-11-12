/**
 * B35 (MB-40): proof that an old no-code or production billing id's number is
 * the number of the current line it would pair with.
 *
 * The editor keeps the number of a current-code or `ML` line id when it loads
 * a plan (`restoreMintedSuffix`). It takes the number of a no-code or old
 * production line from the line's saved position. So `<mba>3` in billing is
 * only the current `<mba><code>3` when the loaded lines say so:
 * - a loaded line has that exact id: it must be the only loaded line of its
 *   media key that asks for that number (`editorClaimedLineNumber`), so the
 *   editor gives it that number;
 * - no loaded line has that id (billing kept an old id after the lines were
 *   re-saved with current ids): exactly one loaded line asks for the number,
 *   and that line's own id is a current-code or `ML` id carrying it (the
 *   B21fix rule in `reconcileLegacyPartialSelection`).
 * A media key with no loaded lines proves nothing.
 *
 * Pure. Used by the edit page's working billing merge, union and ghost check.
 */

import {
  billingLineIdAlias,
  billingLineIdFormKeepsNumber,
  type BillingAliasNumberCheck,
} from "@/lib/billing/billingLineIdAlias"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { editorClaimedLineNumber, type LineItemWithIdentity } from "@/lib/mediaplan/lineItemOrder"

/** Loaded lines (`line_item_id`, `line_item`) by billing media key, before the editor renumbers them. */
export type BillingAliasLoadedLines = Readonly<
  Record<string, readonly LineItemWithIdentity[] | null | undefined>
>

function lineId(line: LineItemWithIdentity): string {
  return toBillingOverrideLineItemId(String(line.line_item_id ?? line.lineItemId ?? "").trim())
}

export function buildBillingAliasNumberCheck(
  loadedLinesByMedia: BillingAliasLoadedLines,
  mbaNumber: string | null | undefined
): BillingAliasNumberCheck {
  const mba = String(mbaNumber ?? "").trim()
  return ({ mediaKey, id, alias }) => {
    if (!mba) return false
    const loaded = (loadedLinesByMedia[mediaKey] ?? []).filter(Boolean)
    if (loaded.length === 0) return false
    const claimers = loaded.filter((line) => editorClaimedLineNumber(line) === alias.lineNumber)
    if (claimers.length !== 1) return false
    const claimer = claimers[0]!
    const wanted = id.toLowerCase()
    const own = loaded.find((line) => lineId(line).toLowerCase() === wanted)
    if (own) return own === claimer
    const claimerAlias = billingLineIdAlias({ id: lineId(claimer), mediaKey, mbaNumber: mba })
    return (
      claimerAlias != null &&
      claimerAlias.key === alias.key &&
      billingLineIdFormKeepsNumber(claimerAlias.form)
    )
  }
}
