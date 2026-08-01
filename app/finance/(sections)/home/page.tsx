import { FinanceSectionsLanding } from "@/components/finance/sections/FinanceSectionsLanding"

/**
 * Internal rewrite target for bare `/finance` (FN7 sections).
 * Browser URL stays `/finance` (middleware rewrite). Not linked in the sidebar.
 */
export default function FinanceSectionsHomePage() {
  return <FinanceSectionsLanding />
}
