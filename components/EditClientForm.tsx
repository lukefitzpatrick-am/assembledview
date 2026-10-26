"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ClientMark } from "@/components/brand/EntityMark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { SavingModal } from "@/components/ui/saving-modal"
import { SuccessModal } from "@/components/ui/success-modal"
import { Badge } from "@/components/ui/badge"
import { useAuthContext } from "@/contexts/AuthContext"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { PlatformAccountsSection } from "@/components/clients/PlatformAccountsSection"
import { ConversionSettingsSection } from "@/components/clients/ConversionSettingsSection"
import { useToast } from "@/components/ui/use-toast"
import {
  asOptionalString,
  buildEditClientDefaults,
  buildEditClientPayload,
  clientEditSchema,
  describeInvalidFields,
  type ClientEditFormValues,
} from "@/lib/clients/editClientFormSchema"

const formatHexColour = (value: string) => {
  const cleaned = value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
  return `#${cleaned}`.toUpperCase().padEnd(7, "0")
}

type ClientFormValues = ClientEditFormValues

interface EditClientFormProps {
  // Accept partial client data from the list API while requiring an id
  client: Partial<ClientFormValues> & { id: number }
  onSuccess: () => void
  /**
   * `panel` — slide-over / narrow shell (~sm:max-w-2xl): stack sooner, avoid 3–4 columns
   * that assume a full-width page at the `md` viewport breakpoint.
   */
  layout?: "page" | "panel"
}

export function EditClientForm({ client, onSuccess, layout = "page" }: EditClientFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const { isAdmin } = useAuthContext()

  const { toast } = useToast()

  const formData = buildEditClientDefaults(client as Record<string, unknown> & { id: number })

  const initialClientBrain = asOptionalString((client as any).client_brain)

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientEditSchema),
    defaultValues: formData,
  })

  /** A field can fail with no visible message (or far down the form): always say which. */
  function onInvalid(errors: Parameters<typeof describeInvalidFields>[0]) {
    const problems = describeInvalidFields(errors)
    console.warn("Edit client form invalid:", problems)
    toast({
      title: "Can't save client yet",
      description:
        problems.length > 0
          ? `Fix ${problems.length === 1 ? "this field" : "these fields"}: ${problems.slice(0, 6).join("; ")}${problems.length > 6 ? "; …" : ""}`
          : "Some fields are invalid.",
      variant: "destructive",
    })
  }

  async function onSubmit(data: ClientFormValues) {
    setIsSaving(true)
    try {
      const apiPayload = buildEditClientPayload(data, { isAdmin, initialClientBrain })

      const response = await fetch(`/api/clients/${data.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiPayload),
      })

      if (!response.ok) {
        throw new Error("Failed to update client")
      }

      setShowSuccess(true)
      onSuccess()
    } catch (error) {
      console.error("Failed to update client:", error)
      alert(`Failed to update client: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsSaving(false)
    }
  }

  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "")
    return numericValue ? formatAUD(Number(numericValue)) : ""
  }

  const formatPercentage = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "")
    return numericValue ? `${Number(numericValue).toFixed(2)}%` : ""
  }

  const isPanel = layout === "panel"
  const grid2 = cn(
    "grid grid-cols-1 gap-4",
    isPanel ? "sm:grid-cols-2" : "md:grid-cols-2"
  )
  const grid3 = cn(
    "grid grid-cols-1 gap-4",
    isPanel ? "sm:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-3"
  )
  const gridCommission = cn(
    "grid gap-4",
    isPanel ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 md:grid-cols-3"
  )
  const grid4 = cn(
    "grid gap-4",
    isPanel ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-4"
  )

  return (
    <>
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className={cn("w-full min-w-0 space-y-8", isPanel && "pb-16")}
      >
          <div className={grid2}>
            <FormField
              control={form.control}
              name="clientname_input"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Client Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clientcategory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Client Category <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className={grid2}>
            <FormField
              control={form.control}
              name="abn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ABN</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={11}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 11)
                        field.onChange(value)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mbaidentifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    MBA Identifier <span className="text-destructive">*</span>
                  </FormLabel>
                  <div className="flex items-center space-x-2">
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    {field.value && (
                      <Badge className="bg-pacing-on-track text-primary-foreground">
                        {field.value}
                      </Badge>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className={grid2}>
            <FormField
              control={form.control}
              name="legalbusinessname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Legal Business Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="streetaddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className={grid3}>
            <FormField
              control={form.control}
              name="suburb"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Suburb</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state_dropdown"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select State"
                      searchPlaceholder="Search states..."
                      options={[
                        { value: "ACT", label: "ACT" },
                        { value: "NSW", label: "NSW" },
                        { value: "QLD", label: "QLD" },
                        { value: "SA", label: "SA" },
                        { value: "TAS", label: "TAS" },
                        { value: "VIC", label: "VIC" },
                        { value: "WA", label: "WA" },
                      ]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="postcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postcode</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : undefined)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className={grid2}>
            <FormField
              control={form.control}
              name="payment_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Payment Days <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      value={field.value ?? 30}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Payment Terms <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Net 30 days" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="min-w-0 rounded-md border p-4">
            <h3 className="text-lg font-semibold mb-4">Key Contact</h3>
            <div className={grid2}>
              <FormField
                control={form.control}
                name="keyfirstname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="keylastname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="keyphone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="+61 4XX XXX XXX"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="keyemail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="min-w-0 rounded-md border p-4">
            <h3 className="text-lg font-semibold mb-4">Billing Contact</h3>
            <div className={grid2}>
              <FormField
                control={form.control}
                name="billingfirstname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="billinglastname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="billingphone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="+61 4XX XXX XXX"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="billingemail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="min-w-0 rounded-md border p-4">
            <h3 className="text-lg font-semibold mb-4">Financial Information</h3>
            <div className={grid2}>
              <FormField
                control={form.control}
                name="monthlyretainer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Retainer</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        value={formatCurrency(field.value?.toString() || "")}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/[^0-9.]/g, "")
                          field.onChange(numericValue ? Number(numericValue) : 0)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="organicsocial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organic Social</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        value={formatCurrency(field.value?.toString() || "")}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/[^0-9.]/g, "")
                          field.onChange(numericValue ? Number(numericValue) : 0)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="min-w-0 rounded-md border p-4">
            <h3 className="text-lg font-semibold mb-4">Commission Retained</h3>
            <div className={gridCommission}>
              {[
                "television",
                "radio",
                "newspapers",
                "magazines",
                "ooh",
                "cinema",
                "digitaldisplay",
                "digitalaudio",
                "digitalvideo",
                "bvod",
              ].map((medium) => (
                <FormField
                  key={medium}
                  control={form.control}
                  name={`${medium}_checkbox` as keyof ClientFormValues}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>{medium.charAt(0).toUpperCase() + medium.slice(1)}</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-md border p-4">
            <h3 className="text-lg font-semibold mb-4">Fees</h3>
            <div className={grid4}>
              {[
                { name: "feesocial", label: "Social Media" },
                { name: "feesearch", label: "Search" },
                { name: "feeprogdisplay", label: "Prog Display" },
                { name: "feeprogvideo", label: "Prog Video" },
                { name: "feeprogbvod", label: "Prog BVOD" },
                { name: "feeprogaudio", label: "Prog Audio" },
                { name: "feeprogooh", label: "Prog OOH" },
                { name: "feecontentcreator", label: "Content Creator" },
              ].map((fee) => (
                <FormField
                  key={fee.name}
                  control={form.control}
                  name={fee.name as keyof ClientFormValues}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fee.label}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          value={formatPercentage(field.value?.toString() || "")}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^0-9.]/g, "")
                            field.onChange(numericValue ? Number(numericValue) : 0)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-md border p-4">
            <h3 className="text-lg font-semibold mb-4">Ad Serving Fees</h3>
            <div className={grid4}>
              {[
                { name: "adservvideo", label: "Video" },
                { name: "adservimp", label: "Impression" },
                { name: "adservdisplay", label: "Display" },
                { name: "adservaudio", label: "Audio" },
              ].map((fee) => (
                <FormField
                  key={fee.name}
                  control={form.control}
                  name={fee.name as keyof ClientFormValues}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fee.label}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          value={formatCurrency(field.value?.toString() || "")}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^0-9.]/g, "")
                            field.onChange(numericValue ? Number(numericValue) : 0)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>

          <PlatformAccountsSection clientId={client.id} />

          <ConversionSettingsSection clientId={client.id} />

          {isAdmin ? (
            <div className="min-w-0 rounded-md border p-4">
              <h3 className="mb-1 text-lg font-semibold">Marketing brain &amp; links</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Profile links and the markdown marketing brain used by Ava copy tools. Admins only.
              </p>
              <div className={cn(grid2, "mb-4")}>
                {(
                  [
                    { name: "website" as const, label: "Website", placeholder: "https://example.com" },
                    { name: "facebook_url" as const, label: "Facebook", placeholder: "https://facebook.com/…" },
                    { name: "instagram_url" as const, label: "Instagram", placeholder: "https://instagram.com/…" },
                    { name: "linkedin_url" as const, label: "LinkedIn", placeholder: "https://linkedin.com/…" },
                    { name: "tiktok_url" as const, label: "TikTok", placeholder: "https://tiktok.com/@…" },
                  ] as const
                ).map((link) => (
                  <FormField
                    key={link.name}
                    control={form.control}
                    name={link.name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{link.label}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            type="text"
                            inputMode="url"
                            autoComplete="url"
                            placeholder={link.placeholder}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormField
                control={form.control}
                name="client_brain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client marketing brain</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        rows={12}
                        className="min-h-[12rem] font-mono text-sm"
                        placeholder="Markdown marketing brain (tone, compliance, never-say, positioning…)"
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      Saved as plain text. Changing this sets{" "}
                      <span className="num">client_brain_updated_at</span> to now (epoch ms).
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : null}

          <FormField
            control={form.control}
            name="brand_colour"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand Colour</FormLabel>
                <div
                  className={cn(
                    "flex flex-col gap-2",
                    !isPanel && "md:flex-row md:items-center md:gap-4"
                  )}
                >
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value?.startsWith("#") ? field.value : `#${field.value}`}
                      onChange={(e) => field.onChange(formatHexColour(e.target.value))}
                      placeholder="Brand hex"
                      maxLength={7}
                    />
                  </FormControl>
                  <ClientMark
                    name={form.watch("clientname_input") || "Client"}
                    colour={field.value}
                    size="md"
                  />
                  <input
                    type="color"
                    className="h-10 w-16 rounded border"
                    value={
                      field.value?.startsWith("#") ? field.value : `#${field.value}`
                    }
                    onChange={(e) => field.onChange(formatHexColour(e.target.value))}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Used for MBA identifier tags.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <div
            className={cn(
              "flex justify-end gap-4 pt-2",
              isPanel &&
                "sticky bottom-0 z-10 -mx-1 border-t border-border/70 bg-background/95 py-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85"
            )}
          >
            <Button type="submit" disabled={isSaving} className={isPanel ? "min-w-[8.5rem]" : undefined}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
      </form>
    </Form>
    <SavingModal isOpen={isSaving} />
    <SuccessModal
      isOpen={showSuccess}
      message="Client updated successfully"
      onClose={() => setShowSuccess(false)}
    />
    </>
  )
}