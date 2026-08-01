"use client"

import { useEffect, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import type { TeamMember } from "@/lib/codex/types"

const teamMemberFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  role_title: z.string().optional(),
  active: z.boolean(),
  capacity_notes: z.string().optional(),
  working_style: z.string().optional(),
})

type TeamMemberFormValues = z.infer<typeof teamMemberFormSchema>

type TeamMemberFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: TeamMember | null
  onSaved: () => void
}

export function TeamMemberFormDialog({
  open,
  onOpenChange,
  member,
  onSaved,
}: TeamMemberFormDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const isEdit = Boolean(member)

  const form = useForm<TeamMemberFormValues>({
    resolver: zodResolver(teamMemberFormSchema) as Resolver<TeamMemberFormValues>,
    defaultValues: {
      name: "",
      email: "",
      role_title: "",
      active: true,
      capacity_notes: "",
      working_style: "",
    },
  })

  useEffect(() => {
    if (!open) return
    if (member) {
      form.reset({
        name: member.name ?? "",
        email: member.email ?? "",
        role_title: member.role_title ?? "",
        active: Boolean(member.active),
        capacity_notes: member.capacity_notes ?? "",
        working_style: member.working_style ?? "",
      })
    } else {
      form.reset({
        name: "",
        email: "",
        role_title: "",
        active: true,
        capacity_notes: "",
        working_style: "",
      })
    }
  }, [open, member, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      if (isEdit && member) {
        const dirty = form.formState.dirtyFields
        const patch: Record<string, unknown> = {}
        if (dirty.name) patch.name = values.name
        if (dirty.email) patch.email = values.email
        if (dirty.role_title) patch.role_title = values.role_title || null
        if (dirty.active) patch.active = values.active
        if (dirty.capacity_notes)
          patch.capacity_notes = values.capacity_notes || null
        if (dirty.working_style)
          patch.working_style = values.working_style || null

        if (Object.keys(patch).length === 0) {
          onOpenChange(false)
          return
        }

        const res = await fetch(
          `/api/codex/team/${encodeURIComponent(String(member.id))}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }
        )
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(
            (body && typeof body === "object" && "message" in body
              ? String((body as { message?: string }).message)
              : null) || "Failed to update team member"
          )
        }
        toast({ title: "Team member updated" })
      } else {
        const payload = {
          name: values.name,
          email: values.email,
          role_title: values.role_title || null,
          active: values.active,
          capacity_notes: values.capacity_notes || null,
          working_style: values.working_style || null,
        }
        const res = await fetch("/api/codex/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(
            (body && typeof body === "object" && "message" in body
              ? String((body as { message?: string }).message)
              : null) || "Failed to add team member"
          )
        }
        toast({ title: "Team member added" })
      }
      onOpenChange(false)
      onSaved()
    } catch (error) {
      console.error("Team member form submit failed:", error)
      toast({
        title: isEdit
          ? "Could not update team member"
          : "Could not add team member",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit team member" : "Add team member"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update roster details. Only changed fields are sent."
              : "Add someone to the Codex assignment roster."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@assembledmedia.com.au"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role_title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Account Manager" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="capacity_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacity notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Optional capacity / availability notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="working_style"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Working style</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-input border border-border px-3 py-2">
                  <div className="space-y-0.5 pr-3">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Inactive members stay on the roster but cannot be
                      assigned to new tasks
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? isEdit
                    ? "Saving…"
                    : "Adding…"
                  : isEdit
                    ? "Save changes"
                    : "Add member"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
