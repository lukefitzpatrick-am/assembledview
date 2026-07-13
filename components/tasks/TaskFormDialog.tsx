"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format, isValid, parseISO } from "date-fns"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { useToast } from "@/components/ui/use-toast"
import { getClientDisplayName } from "@/lib/clients/slug"
import {
  STATUSES,
  TASK_PRIORITIES,
  type CodexTask,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/codex/types"

type ClientOption = {
  id: number
  mp_client_name?: string
  client_name?: string
  slug?: string
}

const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  client_id: z.number().int().positive("Client is required"),
  mba_number: z.string().optional(),
  status: z.enum([
    "backlog",
    "todo",
    "in_progress",
    "waiting",
    "done",
  ]),
  priority: z.enum(["low", "normal", "high"]),
  assignee_email: z.string().optional(),
  assignee_name: z.string().optional(),
  due_date: z.date().nullable().optional(),
  description: z.string().optional(),
  client_visible: z.boolean(),
})

type TaskFormValues = z.infer<typeof taskFormSchema>

function dueDateToFormValue(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const iso = raw.includes("T") ? raw : `${raw}T12:00:00`
  const d = parseISO(iso)
  return isValid(d) ? d : null
}

function dueDateToPayload(d: Date | null | undefined): string | null {
  if (!d || !isValid(d)) return null
  return format(d, "yyyy-MM-dd")
}

type TaskFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: CodexTask | null
  clients: ClientOption[]
  onSaved: () => void
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  clients,
  onSaved,
}: TaskFormDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const isEdit = Boolean(task)

  const sortedClients = useMemo(
    () =>
      [...clients]
        .map((c) => ({
          id: c.id,
          label: getClientDisplayName(c) || String(c.id),
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
        ),
    [clients]
  )

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema) as Resolver<TaskFormValues>,
    defaultValues: {
      title: "",
      client_id: 0,
      mba_number: "",
      status: "todo",
      priority: "normal",
      assignee_email: "",
      assignee_name: "",
      due_date: null,
      description: "",
      client_visible: false,
    },
  })

  useEffect(() => {
    if (!open) return

    let cancelled = false

    const applyDefaults = async () => {
      let meEmail = ""
      let meName = ""
      try {
        const res = await fetch("/api/me")
        if (res.ok) {
          const data = await res.json()
          meEmail =
            typeof data?.user?.email === "string" ? data.user.email : ""
          meName = typeof data?.user?.name === "string" ? data.user.name : ""
        }
      } catch {
        // Prefill is optional
      }
      if (cancelled) return

      if (task) {
        form.reset({
          title: task.title ?? "",
          client_id: Number(task.client_id),
          mba_number: task.mba_number ?? "",
          status: (task.status as TaskStatus) || "todo",
          priority: (task.priority as TaskPriority) || "normal",
          assignee_email: task.assignee_email ?? "",
          assignee_name: task.assignee_name ?? "",
          due_date: dueDateToFormValue(task.due_date),
          description: task.description ?? "",
          client_visible: Boolean(task.client_visible),
        })
      } else {
        form.reset({
          title: "",
          client_id: 0,
          mba_number: "",
          status: "todo",
          priority: "normal",
          assignee_email: meEmail,
          assignee_name: meName || meEmail,
          due_date: null,
          description: "",
          client_visible: false,
        })
      }
    }

    void applyDefaults()
    return () => {
      cancelled = true
    }
  }, [open, task, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      if (isEdit && task) {
        const dirty = form.formState.dirtyFields
        const patch: Record<string, unknown> = {}
        if (dirty.title) patch.title = values.title
        if (dirty.client_id) patch.client_id = values.client_id
        if (dirty.mba_number) patch.mba_number = values.mba_number || null
        if (dirty.status) patch.status = values.status
        if (dirty.priority) patch.priority = values.priority
        if (dirty.assignee_email)
          patch.assignee_email = values.assignee_email || null
        if (dirty.assignee_name)
          patch.assignee_name = values.assignee_name || null
        if (dirty.due_date) patch.due_date = dueDateToPayload(values.due_date)
        if (dirty.description) patch.description = values.description || null
        if (dirty.client_visible) patch.client_visible = values.client_visible

        if (Object.keys(patch).length === 0) {
          onOpenChange(false)
          return
        }

        const res = await fetch(
          `/api/codex/tasks/${encodeURIComponent(String(task.id))}`,
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
              : null) || "Failed to update task"
          )
        }
        toast({ title: "Task updated" })
      } else {
        const payload = {
          title: values.title,
          client_id: values.client_id,
          mba_number: values.mba_number || null,
          status: values.status,
          priority: values.priority,
          assignee_email: values.assignee_email || null,
          assignee_name: values.assignee_name || null,
          due_date: dueDateToPayload(values.due_date),
          description: values.description || null,
          client_visible: values.client_visible,
        }
        const res = await fetch("/api/codex/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(
            (body && typeof body === "object" && "message" in body
              ? String((body as { message?: string }).message)
              : null) || "Failed to create task"
          )
        }
        toast({ title: "Task created" })
      }
      onOpenChange(false)
      onSaved()
    } catch (error) {
      console.error("Task form submit failed:", error)
      toast({
        title: isEdit ? "Could not update task" : "Could not create task",
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
          <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update fields and save. Only changed fields are sent."
              : "Create an internal task. Leave client-visible off for internal work."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Follow up on IO" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select
                    value={
                      field.value > 0 ? String(field.value) : undefined
                    }
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sortedClients.map(({ id, label }) => (
                        <SelectItem key={id} value={String(id)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TASK_PRIORITIES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="mba_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MBA number</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="assignee_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee email</FormLabel>
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
                name="assignee_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee name</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date</FormLabel>
                  <FormControl>
                    <SingleDatePicker
                      value={field.value ?? null}
                      onChange={(d) => field.onChange(d ?? null)}
                      dateFormat="dd MMM yyyy"
                      placeholder={<span>Pick due date</span>}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Notes / context"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="client_visible"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-input border border-border px-3 py-2">
                  <div className="space-y-0.5 pr-3">
                    <FormLabel>Client visible</FormLabel>
                    <FormDescription>
                      Client can see this task later — leave off for internal
                      work
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
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
                    : "Creating…"
                  : isEdit
                    ? "Save changes"
                    : "Create task"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
