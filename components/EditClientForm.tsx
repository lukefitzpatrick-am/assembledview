"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SavingModal } from "@/components/ui/saving-modal"
import { SuccessModal } from "@/components/ui/success-modal"
import { Badge } from "@/components/ui/badge"

const optionalString = z.string().optional().or(z.literal(""))
const clientSchema = z.object({
  id: z.number(),
  clientname_input: z.string().min(1, "Client name is required"),
  mbaidentifier: z.string().min(1, "MBA Identifier is required"),
  clientcategory: optionalString,
  abn: z
    .string()
    .regex(/^[A-Za-z0-9]{11}$/, "ABN must contain 11 letters or numbers after removing spaces or symbols")
    .optional()
    .or(z.literal("")),
  legalbusinessname: optionalString,
  streetaddress: optionalString,
  suburb: optionalString,
  state_dropdown: z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT"]).optional(),
  postcode: z.number().int().min(1000).max(9999).optional(),
  payment_days: z.number().int().positive({
    message: "Payment days must be a positive whole number",
  }).optional(),
  payment_terms: optionalString,
  keyfirstname: optionalString,
  keylastname: optionalString,
  keyphone: z.string().optional(),
  keyemail: z.string().email("Invalid email address").optional().or(z.literal("")),
  billingfirstname: optionalString,
  billinglastname: optionalString,
  billingphone: z.string().optional(),
  billingemail: z.string().email("Invalid email address").optional().or(z.literal("")),
  monthlyretainer: z.number().nonnegative().optional(),
  organicsocial: z.number().nonnegative().optional(),
  television_checkbox: z.boolean().optional(),
  radio_checkbox: z.boolean().optional(),
  newspapers_checkbox: z.boolean().optional(),
  magazines_checkbox: z.boolean().optional(),
  ooh_checkbox: z.boolean().optional(),
  cinema_checkbox: z.boolean().optional(),
  digitaldisplay_checkbox: z.boolean().optional(),
  digitalaudio_checkbox: z.boolean().optional(),
  digitalvideo_checkbox: z.boolean().optional(),
  bvod_checkbox: z.boolean().optional(),
  feesocial: z.number().min(0).max(100).optional(),
  feesearch: z.number().min(0).max(100).optional(),
  feeprogdisplay: z.number().min(0).max(100).optional(),
  feeprogvideo: z.number().min(0).max(100).optional(),
  feeprogbvod: z.number().min(0).max(100).optional(),
  feeprogaudio: z.number().min(0).max(100).optional(),
  feeprogooh: z.number().min(0).max(100).optional(),
  feecontentcreator: z.number().min(0).max(100).optional(),
  adservvideo: z.number().nonnegative().optional(),
  adservimp: z.number().nonnegative().optional(),
  adservdisplay: z.number().nonnegative().optional(),
  adservaudio: z.number().nonnegative().optional(),
  idgoogleads: optionalString,
  idmeta: optionalString,
  idcm360: optionalString,
  iddv360: optionalString,
  idtiktok: optionalString,
  idlinkedin: optionalString,
  idpinterest: optionalString,
  idquantcast: optionalString,
  idtaboola: optionalString,
  idsnapchat: optionalString,
  idbing: optionalString,
  idvistar: optionalString,
  idga4: optionalString,
  idmerchantcentre: optionalString,
  idshopify: optionalString,
  brand_colour: z
    .string()
    .regex(/^#?[0-9A-Fa-f]{6}$/, "Brand colour must be a valid 6-digit hex code (e.g. #49C7EB)")
    .optional()
    .or(z.literal("")),
})

const formatHexColour = (value: string) => {
  const cleaned = value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
  return `#${cleaned}`.toUpperCase().padEnd(7, "0")
}

type ClientFormValues = z.infer<typeof clientSchema>

interface EditClientFormProps {
  // Accept partial client data from the list API while requiring an id
  client: Partial<ClientFormValues> & { id: number }
  onSuccess: () => void
}

export function EditClientForm({ client, onSuccess }: EditClientFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Handle both mp_client_name and clientname_input field names
  const formData = {
    ...client,
    clientname_input: (client as any).mp_client_name || client.clientname_input || '',
    mbaidentifier: client.mbaidentifier || '',
    payment_days: (client as any).payment_days ?? 30,
    payment_terms: (client as any).payment_terms ?? "",
    brand_colour: (client as any).brand_colour ?? "#49C7EB",
    // Convert ABN to string if it comes as a number
    abn: client.abn ? String(client.abn) : '',
    // Convert phone numbers to strings to preserve leading zeros
    keyphone: client.keyphone ? String(client.keyphone) : '',
    billingphone: client.billingphone ? String(client.billingphone) : '',
  }

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: formData as ClientFormValues,
  })

  async function onSubmit(data: ClientFormValues) {
    setIsSaving(true)
    try {
      // Transform clientname_input to mp_client_name for API
      const { clientname_input, ...restData } = data
      const apiPayload = {
        ...restData,
        mp_client_name: clientname_input,
      }
      
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
    return numericValue ? `$${Number(numericValue).toFixed(2)}` : ""
  }

  const formatPercentage = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "")
    return numericValue ? `${Number(numericValue).toFixed(2)}%` : ""
  }

  const platformIdFields: { name: keyof ClientFormValues; label: string }[] = [
    { name: "idgoogleads", label: "Google Ads" },
    { name: "idmeta", label: "Meta" },
    { name: "idcm360", label: "CM360" },
    { name: "iddv360", label: "DV360" },
    { name: "idtiktok", label: "TikTok" },
    { name: "idlinkedin", label: "LinkedIn" },
    { name: "idpinterest", label: "Pinterest" },
    { name: "idquantcast", label: "Quantcast" },
    { name: "idtaboola", label: "Taboola" },
    { name: "idsnapchat", label: "Snapchat" },
    { name: "idbing", label: "Bing" },
    { name: "idvistar", label: "Vistar" },
    { name: "idga4", label: "GA4" },
    { name: "idmerchantcentre", label: "Merchant Centre" },
    { name: "idshopify", label: "Shopify" },
  ]

  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="clientname_input"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Client Name <span className="text-red-500">*</span>
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
                    Client Category <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    MBA Identifier <span className="text-red-500">*</span>
                  </FormLabel>
                  <div className="flex items-center space-x-2">
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    {field.value && (
                      <Badge className="bg-blue-500 text-white">
                        {field.value}
                      </Badge>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select State" />
          </SelectTrigger>
                    </FormControl>
          <SelectContent>
            <SelectItem value="NSW">NSW</SelectItem>
            <SelectItem value="VIC">VIC</SelectItem>
            <SelectItem value="QLD">QLD</SelectItem>
            <SelectItem value="SA">SA</SelectItem>
            <SelectItem value="WA">WA</SelectItem>
            <SelectItem value="TAS">TAS</SelectItem>
            <SelectItem value="ACT">ACT</SelectItem>
          </SelectContent>
        </Select>
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
                      value={Number(field.value) || 0}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="payment_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Payment Days <span className="text-red-500">*</span>
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
                    Payment Terms <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Net 30 days" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Key Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Billing Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Financial Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Commission Retained</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Fees</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Ad Serving Fees</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Platform IDs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {platformIdFields.map((platform) => (
                <FormField
                  key={platform.name}
                  control={form.control}
                  name={platform.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{platform.label}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={(field.value ?? '') as string}
                          placeholder={`Enter ${platform.label} ID`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>

          <FormField
            control={form.control}
            name="brand_colour"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand Colour</FormLabel>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value?.startsWith("#") ? field.value : `#${field.value}`}
                      onChange={(e) => field.onChange(formatHexColour(e.target.value))}
                      placeholder="#49C7EB"
                      maxLength={7}
                    />
                  </FormControl>
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

          <div className="flex justify-end gap-4">
            <Button type="submit" disabled={isSaving}>
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