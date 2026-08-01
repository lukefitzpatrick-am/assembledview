import {
  FinanceSectionPlaceholderCard,
  FinanceSectionsShell,
} from "@/components/finance/sections/FinanceSectionsShell"

export function FinanceSectionPage({
  title,
  placeholderBody,
}: {
  pathname: string
  title: string
  placeholderBody: string
}) {
  return (
    <FinanceSectionsShell title={title}>
      <FinanceSectionPlaceholderCard title={title} body={placeholderBody} />
    </FinanceSectionsShell>
  )
}
