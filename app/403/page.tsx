import { AccessDenied } from "@/components/AccessDenied"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/403")

export default function Forbidden403Page() {
  return <AccessDenied reason="permission" />
}
