"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/contexts/AuthContext";
import { AdminGuard } from "@/components/guards/AdminGuard";

type Status = "idle" | "loading" | "success" | "error";
type Role = "admin" | "client";
type ClientOption = { id: number; mp_client_name: string; slug?: string };

export default function NewAdminUserPage() {
  const { isAdmin } = useAuthContext();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [role, setRole] = useState<Role>("client");
  const [clientSlug, setClientSlug] = useState<string>("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClients() {
      try {
        const resp = await fetch("/api/clients");
        if (!resp.ok) throw new Error("Failed to fetch clients");
        const data = await resp.json();
        if (Array.isArray(data)) {
          setClients(data);
        }
      } catch (err) {
        console.error("Failed to load clients list", err);
      }
    }
    if (isAdmin) {
      fetchClients();
    }
  }, [isAdmin]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
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
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }

      setStatus("success");
      setForm({ firstName: "", lastName: "", email: "", password: "" });
      setClientSlug("");
      setRole("client");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  };

  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
      <AdminGuard>
      <div className="mx-auto flex max-w-xl flex-col gap-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Create Auth0 User</h1>
          <p className="text-sm text-muted-foreground">
            Creates a user, marks email as verified, generates a password set link, and emails the invite.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm">
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
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="admin">Admin</option>
              <option value="client">Client</option>
            </select>
          </div>

          {role === "client" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="clientId">Client</Label>
              <select
                id="clientId"
                value={clientSlug}
                onChange={(e) => setClientSlug(e.target.value)}
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.slug ?? String(client.id)}>
                    {client.mp_client_name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Client users are restricted to their assigned client dashboards.
              </p>
            </div>
          )}

          <Button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Creating..." : "Create user"}
          </Button>

          {status === "success" && (
            <p className="text-sm text-green-600">User created and invite sent.</p>
          )}

          {status === "error" && (
            <p className="text-sm text-red-600">
              Failed to create user {error ? `- ${error}` : ""}
            </p>
          )}
        </form>

        <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          Only allowlisted admins can use this tool. The backend uses the Auth0 Management API to create the user, mark the email as verified, generate a password-set ticket (24h), and send the invite via SendGrid (or SMTP fallback).
        </div>
      </div>
      </AdminGuard>
    </Suspense>
  );
}
















