import { AccessDenied } from "@/components/AccessDenied"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/forbidden")

export default function ForbiddenPage() {
  return <AccessDenied reason="unconfigured" />
}
