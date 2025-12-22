"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "idle" | "loading" | "success" | "error";

export default function NewAdminUserPage() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

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
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }

      setStatus("success");
      setForm({ firstName: "", lastName: "", email: "", password: "" });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  };

  return (
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
            autoComplete="new-password"
            minLength={8}
          />
        </div>

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
  );
}


