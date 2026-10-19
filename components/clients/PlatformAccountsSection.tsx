"use client"

import { useEffect, useMemo, useState } from "react"
import { Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PLATFORM_ACCOUNT_LABELS,
  formatAccountRef,
  isAdvertiserNamePlatform,
  normaliseAccountRef,
  platformAccountChoices,
  type PlatformAccountPlatform,
} from "@/lib/clients/platformAccounts"

type AccountRow = {
  id: number
  platform: string
  accountRef: string
  label: string | null
}

type AdvertiserOption = {
  name: string
  lastSeen: string | null
}

type AdvertiserState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; advertisers: AdvertiserOption[] }
  | { status: "missing" }
  | { status: "error" }

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error || `Request failed (${res.status})`
}

export function PlatformAccountsSection({ clientId }: { clientId: number }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [listNote, setListNote] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [platform, setPlatform] = useState<PlatformAccountPlatform>("cm360")
  const [rawRef, setRawRef] = useState("")
  const [label, setLabel] = useState("")
  const [advertisers, setAdvertisers] = useState<AdvertiserState>({ status: "idle" })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetch(`/api/clients/${clientId}/platform-accounts`)
      .then(async (res) => {
        if (res.status === 503) {
          if (!cancelled) {
            setAccounts([])
            setListNote("Platform accounts are not set up yet")
            setListError(null)
          }
          return
        }
        if (!res.ok) throw new Error(await readError(res))
        const body = (await res.json()) as { accounts?: AccountRow[] }
        if (!cancelled) {
          setAccounts(body.accounts ?? [])
          setListNote(null)
          setListError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAccounts([])
          setListError(err instanceof Error ? err.message : "Could not load platform accounts")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  useEffect(() => {
    if (!isAdvertiserNamePlatform(platform)) {
      setAdvertisers({ status: "idle" })
      return
    }
    let cancelled = false
    setAdvertisers({ status: "loading" })
    void fetch(`/api/platform-accounts/advertisers?platform=${platform}`)
      .then(async (res) => {
        if (res.status === 503) {
          if (!cancelled) setAdvertisers({ status: "missing" })
          return
        }
        if (!res.ok) throw new Error(await readError(res))
        const body = (await res.json()) as { advertisers?: AdvertiserOption[] }
        if (!cancelled) setAdvertisers({ status: "ready", advertisers: body.advertisers ?? [] })
      })
      .catch(() => {
        if (!cancelled) setAdvertisers({ status: "error" })
      })
    return () => {
      cancelled = true
    }
  }, [platform])

  const lastSeenByName = useMemo(() => {
    const map = new Map<string, string | null>()
    if (advertisers.status !== "ready") return map
    for (const row of advertisers.advertisers) map.set(row.name, row.lastSeen)
    return map
  }, [advertisers])

  const preview = useMemo(() => {
    if (isAdvertiserNamePlatform(platform) && advertisers.status === "ready") return null
    if (!rawRef.trim()) return null
    try {
      const stored = normaliseAccountRef(platform, rawRef)
      return { stored: formatAccountRef(platform, stored), error: null as string | null }
    } catch (err) {
      return { stored: null, error: err instanceof Error ? err.message : "Check the account" }
    }
  }, [platform, rawRef, advertisers.status])

  async function addAccount() {
    setFormError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/platform-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          accountRef: rawRef,
          label: label.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await readError(res))
      const body = (await res.json()) as { account: AccountRow }
      setAccounts((current) => [...current, body.account].sort((a, b) => a.platform.localeCompare(b.platform)))
      setRawRef("")
      setLabel("")
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add the account")
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id: number) {
    setBusyId(id)
    setFormError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/platform-accounts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: false }),
      })
      if (!res.ok) throw new Error(await readError(res))
      setAccounts((current) => current.filter((row) => row.id !== id))
      setConfirmId(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not deactivate the account")
    } finally {
      setBusyId(null)
    }
  }

  const choices = platformAccountChoices(process.env.NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB)
  const pickerReady = advertisers.status === "ready"

  return (
    <div
      id="platform-accounts"
      className="min-w-0 scroll-mt-6 rounded-md border p-4"
      data-platform-choices={choices.join(" ")}
    >
      <h3 className="mb-1 text-lg font-semibold">Platform accounts</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        A client can have more than one account on a platform. CM360 and DV360 use the advertiser name.
      </p>

      {loading ? <p className="mb-4 text-sm text-muted-foreground">Loading accounts…</p> : null}
      {listError ? (
        <p className="mb-4 rounded-input border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {listError}
        </p>
      ) : null}
      {listNote ? <p className="mb-4 text-sm text-muted-foreground">{listNote}</p> : null}

      {!loading && accounts.length === 0 ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="h-4 w-4" aria-hidden />
          <span>No platform accounts yet.</span>
        </div>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="mb-4 divide-y divide-border rounded-input border">
          {accounts.map((account) => {
            const platformLabel = isPlatformLabel(account.platform)
              ? PLATFORM_ACCOUNT_LABELS[account.platform]
              : account.platform
            const lastSeen = isAdvertiserNamePlatform(account.platform)
              ? lastSeenByName.get(account.accountRef)
              : undefined
            return (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{platformLabel}</p>
                  <p className="num text-sm">{formatAccountRef(account.platform, account.accountRef)}</p>
                  {account.label ? <p className="text-sm text-muted-foreground">{account.label}</p> : null}
                  {lastSeen ? <p className="text-xs text-muted-foreground">Last seen {lastSeen}</p> : null}
                </div>
                {confirmId === account.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Deactivate this account?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busyId === account.id}
                      onClick={() => void deactivate(account.id)}
                    >
                      Deactivate
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmId(account.id)}>
                    Deactivate
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Platform</span>
          <Select
            value={platform}
            onValueChange={(value) => {
              if (isPlatformLabel(value)) {
                setPlatform(value)
                setRawRef("")
                setFormError(null)
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((value) => (
                <SelectItem key={value} value={value}>
                  {PLATFORM_ACCOUNT_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="block text-sm">
          <span className="mb-1 block font-medium">
            {isAdvertiserNamePlatform(platform) ? "Advertiser" : "Account"}
          </span>
          {pickerReady ? (
            <Combobox
              options={advertisers.advertisers.map((row) => ({
                value: row.name,
                label: row.lastSeen ? `${row.name} · last seen ${row.lastSeen}` : row.name,
              }))}
              value={rawRef}
              onValueChange={setRawRef}
              placeholder="Search advertisers"
              searchPlaceholder="Search advertisers"
              emptyText="No advertisers"
            />
          ) : (
            <Input
              value={rawRef}
              onChange={(event) => setRawRef(event.target.value)}
              placeholder={
                advertisers.status === "missing"
                  ? "Type the name as the platform shows it"
                  : isAdvertiserNamePlatform(platform)
                    ? "Advertiser name"
                    : "Account id"
              }
              disabled={advertisers.status === "loading"}
            />
          )}
          {advertisers.status === "missing" ? (
            <p className="mt-1 text-xs text-muted-foreground">Advertiser list not set up yet. Type the name as the platform shows it.</p>
          ) : null}
          {advertisers.status === "loading" ? (
            <p className="mt-1 text-xs text-muted-foreground">Loading advertisers…</p>
          ) : null}
          {preview?.error ? <p className="mt-1 text-xs text-destructive">{preview.error}</p> : null}
          {preview?.stored ? <p className="mt-1 text-xs text-muted-foreground">Stored as {preview.stored}</p> : null}
        </div>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Label</span>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Optional" />
        </label>
      </div>

      {formError ? <p className="mt-3 text-sm text-destructive">{formError}</p> : null}

      <div className="mt-3">
        <Button type="button" size="sm" disabled={saving || !rawRef.trim()} onClick={() => void addAccount()}>
          {saving ? "Adding…" : "Add account"}
        </Button>
      </div>
    </div>
  )
}

function isPlatformLabel(value: string): value is PlatformAccountPlatform {
  return platformAccountChoices("1").includes(value as PlatformAccountPlatform)
}
