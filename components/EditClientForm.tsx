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

const clientSchema = z.object({
  id: z.number(),
  clientname_input: z.string().min(1, "Client name is required"),
  clientcategory: z.string().min(1, "Client category is required"),
  abn: z.string().regex(/^\d{11}$/, "ABN must be exactly 11 digits").optional().or(z.literal("")),
  mbaidentifier: z.string().min(1, "MBA Identifier is required"),
  legalbusinessname: z.string().optional(),
  streetaddress: z.string().optional(),
  suburb: z.string().optional(),
  state_dropdown: z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT"]).optional(),
  postcode: z.number().int().min(1000).max(9999).optional(),
  keyfirstname: z.string().optional(),
  keylastname: z.string().optional(),
  keyphone: z.number().int().positive().optional(),
  keyemail: z.string().email("Invalid email address").optional().or(z.literal("")),
  billingfirstname: z.string().optional(),
  billinglastname: z.string().optional(),
  billingphone: z.number().int().positive().optional(),
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
  idgoogleads: z.string().optional(),
  idmeta: z.string().optional(),
  idcm360: z.string().optional(),
  iddv360: z.string().optional(),
  idtiktok: z.string().optional(),
  idlinkedin: z.string().optional(),
  idpinterest: z.string().optional(),
  idquantcast: z.string().optional(),
  idtaboola: z.string().optional(),
  idsnapchat: z.string().optional(),
  idbing: z.string().optional(),
  idvistar: z.string().optional(),
  idga4: z.string().optional(),
  idmerchantcentre: z.string().optional(),
  idshopify: z.string().optional(),
})

type ClientFormValues = z.infer<typeof clientSchema>

interface EditClientFormProps {
  client: ClientFormValues
  onSuccess: () => void
}

export function EditClientForm({ client, onSuccess }: EditClientFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: client,
  })

  async function onSubmit(data: ClientFormValues) {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/clients/${data.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
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
                        const value = e.target.value.replace(/\D/g, "").slice(0, 11)
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
                        type="number"
                        value={field.value as number}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
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
                        type="number"
                        value={field.value as number}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
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
            <div className="grid grid-cols-2 gap-4">
              {[
                "googleads",
                "meta",
                "cm360",
                "dv360",
                "tiktok",
                "linkedin",
                "pinterest",
                "quantcast",
                "taboola",
                "snapchat",
                "bing",
                "vistar",
                "ga4",
                "merchantcentre",
                "shopify",
              ].map((platform) => (
                <FormField
                  key={platform}
                  control={form.control}
                  name={`id${platform}` as keyof ClientFormValues}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>{platform.charAt(0).toUpperCase() + platform.slice(1)}</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>
      </form>
    </Form>
    </>
  )
}