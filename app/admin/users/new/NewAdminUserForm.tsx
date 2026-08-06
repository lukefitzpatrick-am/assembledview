"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import { useAuthContext } from "@/contexts/AuthContext"
import {
  applyClientsFetchResult,
  fetchClientsList,
} from "@/lib/clients/fetchClientsList"
import { getClientDisplayName } from "@/lib/clients/slug"
import { resolveAuth0ClientIdentifier } from "@/lib/clients/auth0ClientIdentifier"

type Status = "idle" | "loading" | "success" | "error"
type Role = "admin" | "client"
type ClientOption = { mp_client_name: string; auth0ClientId: string }

type NewAdminUserFormProps = {
  /** Cosmetic only — POST /api/admin/users enforces SUPERADMIN_EMAIL_ALLOWLIST. */
  canGrantAdminRole: boolean
}

export function NewAdminUserForm({ canGrantAdminRole }: NewAdminUserFormProps) {
  const { isAdmin } = useAuthContext()
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  })
  const [role, setRole] = useState<Role>("client")
  const [clientSlug, setClientSlug] = useState<string>("")
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  const roleOptions = useMemo(() => {
    const client = { value: "client", label: "Client" }
    if (!canGrantAdminRole) return [client]
    return [{ value: "admin", label: "Admin" }, client]
  }, [canGrantAdminRole])

  useEffect(() => {
    if (!canGrantAdminRole && role === "admin") {
      setRole("client")
    }
  }, [canGrantAdminRole, role])

  useEffect(() => {
    async function loadClients() {
      try {
        const result = await fetchClientsList()
        const ui = applyClientsFetchResult(result)
        setClientsError(ui.clientsError)
        if (!ui.clientsError) {
          const normalized = ui.clients
            .map((raw: Record<string, unknown>) => {
              const name = getClientDisplayName(raw)
              const auth0ClientId = resolveAuth0ClientIdentifier(raw)
              return {
                mp_client_name: String(name),
                auth0ClientId: auth0ClientId ?? "",
              } satisfies ClientOption
            })
            .filter((c: ClientOption) => Boolean(c.auth0ClientId))
          setClients(normalized)
        } else {
          setClients([])
        }
      } catch (err) {
        console.error("Failed to load clients list", err)
        setClients([])
        setClientsError("Client list unavailable — try again")
      }
    }
    if (isAdmin) {
      void loadClients()
    }
  }, [isAdmin])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus("loading")
    setError(null)

    try {
      if (role === "client" && clientsError) {
        setStatus("error")
        setError(clientsError)
        return
      }
      if (role === "client" && !clientSlug) {
        setStatus("error")
        setError("Client is required when role is Client.")
        return
      }

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
          role,
          clientSlug: role === "client" ? clientSlug : undefined,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Request failed")
      }

      setStatus("success")
      setForm({ firstName: "", lastName: "", email: "", password: "" })
      setClientSlug("")
      setRole("client")
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Unexpected error")
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 bg-background px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Create Auth0 User</h1>
        <p className="text-sm text-muted-foreground">
          Creates a user, marks email as verified, generates a password set link, and emails the
          invite.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-card border border-border bg-card p-6 shadow-e1"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
            required
            autoComplete="given-name"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
            required
            autoComplete="family-name"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
            autoComplete="email"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Temporary password</Label>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Auth0 requires a password at creation. The user can change it from the invite link.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Role</Label>
          <Combobox
            value={role}
            onValueChange={(value) => {
              setRole(value as Role)
              if (value !== "client") setClientSlug("")
            }}
            placeholder="Select role"
            searchPlaceholder="Search roles..."
            options={roleOptions}
          />
          {!canGrantAdminRole ? (
            <p className="text-xs text-muted-foreground">
              Creating admin users is limited to allowlisted operators. Client invites remain
              available.
            </p>
          ) : null}
        </div>

        {role === "client" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientSlug">Client</Label>
            {clientsError ? (
              <p role="alert" className="rounded-input border border-status-critical-fg/30 bg-status-critical/10 px-3 py-2 text-sm text-status-critical-fg">
                {clientsError}
              </p>
            ) : (
              <Combobox
                value={clientSlug}
                onValueChange={setClientSlug}
                placeholder="Select client"
                searchPlaceholder="Search clients..."
                emptyText={clients.length === 0 ? "No clients available." : "No clients found."}
                options={clients.map((client) => ({
                  value: client.auth0ClientId,
                  label: client.mp_client_name,
                }))}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Stored in Auth0 as client slug (MBA identifier when set, otherwise the client URL
              slug — never the numeric Xano id).
            </p>
          </div>
        )}

        <Button
          type="submit"
          disabled={status === "loading" || (role === "client" && Boolean(clientsError))}
        >
          {status === "loading" ? "Creating..." : "Create user"}
        </Button>

        {status === "success" && (
          <p className="text-sm font-medium text-status-ahead-fg">User created and invite sent.</p>
        )}

        {status === "error" && (
          <p className="text-sm font-medium text-status-critical-fg">
            Failed to create user {error ? `- ${error}` : ""}
          </p>
        )}
      </form>

      <div className="rounded-card border border-border bg-surface-panel p-4 text-sm text-muted-foreground shadow-e0">
        Any user with the admin role can invite clients. Creating or promoting to the admin role
        requires an allowlisted operator (server-enforced). The backend uses the Auth0 Management
        API to create the user, mark the email as verified, generate a password-set ticket (24h),
        and send the invite via SendGrid (or SMTP fallback).
      </div>
    </div>
  )
}
