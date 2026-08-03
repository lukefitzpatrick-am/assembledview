import { Suspense } from "react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { LoadingState } from "@/components/ui/states"
import { auth0 } from "@/lib/auth0"
import { canGrantAdminRole } from "@/lib/auth/canGrantAdminRole"
import { NewAdminUserForm } from "./NewAdminUserForm"

export default async function NewAdminUserPage() {
  const session = await auth0.getSession()
  const email =
    typeof session?.user?.email === "string" ? session.user.email : null
  // Cosmetic only — POST /api/admin/users is the real gate.
  const mayGrantAdmin = canGrantAdminRole(email)

  return (
    <Suspense fallback={<LoadingState rows={4} className="mx-auto mt-10 max-w-xl shadow-e1" />}>
      <AdminGuard>
        <NewAdminUserForm canGrantAdminRole={mayGrantAdmin} />
      </AdminGuard>
    </Suspense>
  )
}
