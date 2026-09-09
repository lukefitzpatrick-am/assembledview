"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAuthContext } from "@/contexts/AuthContext"
import {
  applyClientsFetchResult,
  fetchClientsList,
} from "@/lib/clients/fetchClientsList"
import { getClientDisplayName } from "@/lib/clients/slug"

type Status = "idle" | "loading" | "success" | "error"
type Role = "admin" | "client"
type ClientOption = { id: number | null; mp_client_name: string; slug: string }
type MbaCampaignOption = { mba_number: string; campaign_name: string; label: string }

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
  const [clientSlugs, setClientSlugs] = useState<string[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [restrictMbas, setRestrictMbas] = useState(false)
  const [mbaNumbers, setMbaNumbers] = useState<string[]>([])
  const [mbaCampaigns, setMbaCampaigns] = useState<MbaCampaignOption[]>([])
  const [mbaError, setMbaError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  const roleOptions = useMemo(() => {
    const client = { value: "client", label: "Client" }
    if (!canGrantAdminRole) return [client]
    return [{ value: "admin", label: "Admin" }, client]
  }, [canGrantAdminRole])

  const clientBySlug = useMemo(() => {
    return new Map(clients.map((client) => [client.slug, client]))
  }, [clients])

  const unusedClientOptions = useMemo(
    () =>
      clients
        .filter((client) => !clientSlugs.includes(client.slug))
        .map((client) => ({
          value: client.slug,
          label: `${client.mp_client_name} (${client.slug})`,
        })),
    [clients, clientSlugs],
  )

  const unusedMbaOptions = useMemo(
    () =>
      mbaCampaigns
        .filter((campaign) => !mbaNumbers.includes(campaign.mba_number.trim().toLowerCase()))
        .map((campaign) => ({
          value: campaign.mba_number.trim().toLowerCase(),
          label: campaign.label,
        })),
    [mbaCampaigns, mbaNumbers],
  )

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
              const slug = String(raw.slug ?? "").trim().toLowerCase()
              const idNum = Number(raw.id)
              return {
                id: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
                mp_client_name: String(name),
                slug,
              } satisfies ClientOption
            })
            .filter((c: ClientOption) => Boolean(c.slug))
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

  useEffect(() => {
    if (!restrictMbas || role !== "client" || clientSlugs.length === 0) {
      setMbaCampaigns([])
      setMbaError(null)
      return
    }

    const slugsKey = clientSlugs.join(",")
    let cancelled = false

    async function loadMbas() {
      try {
        const response = await fetch(
          `/api/admin/users/mba-numbers?slugs=${encodeURIComponent(slugsKey)}`,
        )
        const body = (await response.json().catch(() => ({}))) as {
          campaigns?: MbaCampaignOption[]
          error?: string
        }
        if (cancelled) return
        if (!response.ok) {
          setMbaCampaigns([])
          setMbaError(body.error || "Campaign list unavailable — try again")
          return
        }
        setMbaError(null)
        const campaigns = Array.isArray(body.campaigns) ? body.campaigns : []
        setMbaCampaigns(campaigns)
        const allowed = new Set(
          campaigns.map((campaign) => campaign.mba_number.trim().toLowerCase()),
        )
        setMbaNumbers((prev) => prev.filter((mba) => allowed.has(mba)))
      } catch (err) {
        console.error("Failed to load campaign list", err)
        if (!cancelled) {
          setMbaCampaigns([])
          setMbaError("Campaign list unavailable — try again")
        }
      }
    }

    void loadMbas()
    return () => {
      cancelled = true
    }
  }, [restrictMbas, role, clientSlugs])

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
      if (role === "client" && clientSlugs.length === 0) {
        setStatus("error")
        setError("Client is required when role is Client.")
        return
      }
      if (role === "client" && restrictMbas && mbaError) {
        setStatus("error")
        setError(mbaError)
        return
      }
      if (role === "client" && restrictMbas && mbaNumbers.length === 0) {
        setStatus("error")
        setError("Pick at least one campaign, or turn off campaign restriction.")
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
          clientSlugs: role === "client" ? clientSlugs : undefined,
          mbaNumbers: role === "client" && restrictMbas ? mbaNumbers : undefined,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Request failed")
      }

      setStatus("success")
      setForm({ firstName: "", lastName: "", email: "", password: "" })
      setClientSlugs([])
      setMbaNumbers([])
      setRestrictMbas(false)
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
              if (value !== "client") {
                setClientSlugs([])
                setMbaNumbers([])
                setRestrictMbas(false)
              }
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
            <Label htmlFor="clientSlugs">Clients</Label>
            {clientsError ? (
              <p role="alert" className="rounded-input border border-status-critical-fg/30 bg-status-critical/10 px-3 py-2 text-sm text-status-critical-fg">
                {clientsError}
              </p>
            ) : (
              <>
                {clientSlugs.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {clientSlugs.map((slug, index) => {
                      const client = clientBySlug.get(slug)
                      const label = client
                        ? `${client.mp_client_name} (${slug})`
                        : slug
                      return (
                        <li
                          key={slug}
                          className="flex items-center gap-2 rounded-input border border-border bg-surface-panel px-3 py-2"
                        >
                          <span className="min-w-0 flex-1 font-mono text-sm text-foreground">
                            {label}
                          </span>
                          {index === 0 ? (
                            <Badge size="sm" variant="default">
                              Primary
                            </Badge>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground"
                              onClick={() =>
                                setClientSlugs((prev) => [
                                  slug,
                                  ...prev.filter((entry) => entry !== slug),
                                ])
                              }
                            >
                              Make primary
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            aria-label={`Remove ${slug}`}
                            onClick={() =>
                              setClientSlugs((prev) => prev.filter((entry) => entry !== slug))
                            }
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
                <Combobox
                  id="clientSlugs"
                  value=""
                  onValueChange={(value) => {
                    if (!value || clientSlugs.includes(value)) return
                    setClientSlugs((prev) => [...prev, value])
                  }}
                  placeholder={clientSlugs.length === 0 ? "Select client" : "Add another client"}
                  searchPlaceholder="Search clients..."
                  emptyText={
                    unusedClientOptions.length === 0
                      ? "No more clients to add."
                      : "No clients found."
                  }
                  options={unusedClientOptions}
                />
              </>
            )}
            <p className="text-xs text-muted-foreground">
              First pick is the landing dashboard (Primary). Group siblings sharing an identifier
              are not added automatically — pick each slug you need.
            </p>

            <div className="mt-2 flex items-center gap-3">
              <Switch
                id="restrictMbas"
                aria-labelledby="restrictMbas-label"
                checked={restrictMbas}
                onCheckedChange={(checked) => {
                  setRestrictMbas(checked)
                  if (!checked) setMbaNumbers([])
                }}
                disabled={clientSlugs.length === 0}
              />
              <Label id="restrictMbas-label" htmlFor="restrictMbas">
                Restrict to specific campaigns
              </Label>
            </div>

            {restrictMbas ? (
              <div className="flex flex-col gap-2">
                {mbaError ? (
                  <p role="alert" className="rounded-input border border-status-critical-fg/30 bg-status-critical/10 px-3 py-2 text-sm text-status-critical-fg">
                    {mbaError}
                  </p>
                ) : (
                  <>
                    {mbaNumbers.length > 0 ? (
                      <ul className="flex flex-wrap gap-2">
                        {mbaNumbers.map((mba) => (
                          <li
                            key={mba}
                            className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-panel px-2 py-1"
                          >
                            <span className="font-mono text-xs text-foreground">{mba}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-muted-foreground"
                              aria-label={`Remove ${mba}`}
                              onClick={() =>
                                setMbaNumbers((prev) => prev.filter((entry) => entry !== mba))
                              }
                            >
                              <X className="h-3 w-3" aria-hidden />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Combobox
                      value=""
                      onValueChange={(value) => {
                        if (!value || mbaNumbers.includes(value)) return
                        setMbaNumbers((prev) => [...prev, value])
                      }}
                      placeholder="Select campaigns"
                      searchPlaceholder="Search campaigns..."
                      emptyText={
                        unusedMbaOptions.length === 0
                          ? "No campaigns for these clients."
                          : "No campaigns found."
                      }
                      options={unusedMbaOptions}
                      preserveOrder
                    />
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Only campaigns on the selected clients. Leave this off to allow every MBA those
                  clients own.
                </p>
              </div>
            ) : null}
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
