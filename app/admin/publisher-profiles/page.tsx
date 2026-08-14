import { redirect } from "next/navigation"
import { ADMIN_PUBLISHER_PROFILES_REDIRECT } from "@/lib/nav/publisherProfilesRedirect"

/** Retired — ingest mapping lives on the Publisher Hub. */
export default function PublisherProfilesAdminPage() {
  redirect(ADMIN_PUBLISHER_PROFILES_REDIRECT)
}
