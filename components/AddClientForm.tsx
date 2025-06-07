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
import { ErrorModal } from "@/components/ui/error-modal"

const phoneRegex = /^(?:\+61|0)[2-478](?:[ -]?[0-9]){8}$/
const abnRegex = /^\d{11}$/

const clientSchema = z.object({
  clientname_input: z.string().min(1, "Client name is required"),
  clientcategory: z.string().min(1, "Client category is required"),
  abn: z
    .string()
    .regex(/^\d{11}$/, "ABN must be exactly 11 digits")
    .optional()
    .or(z.literal("")),
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

interface AddClientFormProps {
  onSuccess: () => void
}

export function AddClientForm({ onSuccess }: AddClientFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      clientname_input: "",
      clientcategory: "",
      abn: "",
      mbaidentifier: "",
      legalbusinessname: "",
      streetaddress: "",
      suburb: "",
      state_dropdown: "NSW",
      postcode: 0,
      keyfirstname: "",
      keylastname: "",
      keyphone: 0,
      keyemail: "",
      billingfirstname: "",
      billinglastname: "",
      billingphone: 0,
      billingemail: "",
      monthlyretainer: 0,
      organicsocial: 0,
      television_checkbox: true,
      radio_checkbox: true,
      newspapers_checkbox: true,
      magazines_checkbox: true,
      ooh_checkbox: true,
      cinema_checkbox: true,
      digitaldisplay_checkbox: true,
      digitalaudio_checkbox: true,
      digitalvideo_checkbox: true,
      bvod_checkbox: true,
      feesocial: 20,
      feesearch: 20,
      feeprogdisplay: 20,
      feeprogvideo: 20,
      feeprogbvod: 20,
      feeprogaudio: 20,
      feeprogooh: 20,
      feecontentcreator: 20,
      adservvideo: 0.89,
      adservimp: 0.12,
      adservdisplay: 0.12,
      adservaudio: 0.4,
      idgoogleads: "",
      idmeta: "",
      idcm360: "",
      iddv360: "",
      idtiktok: "",
      idlinkedin: "",
      idpinterest: "",
      idquantcast: "",
      idtaboola: "",
      idsnapchat: "",
      idbing: "",
      idvistar: "",
      idga4: "",
      idmerchantcentre: "",
      idshopify: "",
    },
  })

  async function onSubmit(data: ClientFormValues) {
    setIsSaving(true)
    try {
      console.log("Submitting client data:", JSON.stringify(data, null, 2))
      
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()
      console.log("API response:", JSON.stringify(result, null, 2))

      if (!response.ok) {
        throw new Error(JSON.stringify(result))
      }

      console.log("Client created successfully:", result)
      setShowSuccess(true)
      onSuccess()
    } catch (error) {
      console.error("Error creating client:", error)
      let errorMessage = "An unexpected error occurred"
      let errorTitle = "Error"
      
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message)
          console.error("Parsed error details:", parsedError)
          
          if (parsedError.details) {
            if (Array.isArray(parsedError.details)) {
              errorTitle = "Missing Required Fields"
              errorMessage = `Please fill in the following required fields: ${parsedError.details.join(", ")}`
            } else if (typeof parsedError.details === 'object') {
              errorTitle = "API Error"
              errorMessage = `The server returned an error: ${JSON.stringify(parsedError.details)}`
            } else {
              errorTitle = "API Error"
              errorMessage = `The server returned an error: ${parsedError.details}`
            }
          } else if (parsedError.error) {
            errorTitle = "Error"
            errorMessage = parsedError.error
          } else if (parsedError.message) {
            errorTitle = "Error"
            errorMessage = parsedError.message
          } else {
            errorTitle = "Error"
            errorMessage = error.message
          }
        } catch (parseError) {
          console.error("Error parsing error message:", parseError)
          errorTitle = "Error"
          errorMessage = error.message
        }
      }
      
      // Show error modal instead of alert
      setError({ title: errorTitle, message: errorMessage })
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
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
                      <SelectValue placeholder="Select a state" />
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
                    value={field.value === undefined ? 0 : field.value} 
                    onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Key Contact Information */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="keyfirstname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key Contact First Name</FormLabel>
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
                  <FormLabel>Key Contact Last Name</FormLabel>
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
                  <FormLabel>Key Contact Phone</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value === undefined ? 0 : field.value}
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
                  <FormLabel>Key Contact Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Billing Contact Information */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="billingfirstname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing Contact First Name</FormLabel>
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
                  <FormLabel>Billing Contact Last Name</FormLabel>
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
                  <FormLabel>Billing Contact Phone</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value === undefined ? 0 : field.value}
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
                  <FormLabel>Billing Contact Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Financial Information */}
          <div className="grid grid-cols-2 gap-4">
            {/* Monthly Retainer */}
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
                      value={formatCurrency(field.value.toString())}
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

            {/* Organic Social Retainer */}
            <FormField
              control={form.control}
              name="organicsocial"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organic Social Retainer</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      value={formatCurrency(field.value.toString())}
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

          {/* Checkboxes */}
          <div className="border p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Commission retained</h3>
            <div className="grid grid-cols-3 gap-4">
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
                          checked={field.value as boolean} 
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

          {/* Fees */}
          <div className="grid grid-cols-2 gap-4">
            {["social", "search", "progdisplay", "progvideo", "progbvod", "progaudio", "progooh", "contentcreator"].map(
              (feeType) => (
                <FormField
                  key={feeType}
                  control={form.control}
                  name={`fee${feeType}` as keyof ClientFormValues}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{`${feeType.charAt(0).toUpperCase() + feeType.slice(1)} Fee`}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          value={formatPercentage(field.value.toString())}
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
              ),
            )}
          </div>

          {/* Ad Serving */}
          <div className="grid grid-cols-2 gap-4">
            {["video", "imp", "display", "audio"].map((adServType) => (
              <FormField
                key={adServType}
                control={form.control}
                name={`adserv${adServType}` as keyof ClientFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{`Ad Serve ${adServType.charAt(0).toUpperCase() + adServType.slice(1)}`}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        value={formatCurrency(field.value.toString())}
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

          {/* Platform IDs */}
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
                  <FormItem>
                    <FormLabel>{`${platform.toUpperCase()} ID`}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value as string} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Creating..." : "Create Client"}
          </Button>
        </form>
      </Form>

      <SavingModal isOpen={isSaving} />
      <SuccessModal isOpen={showSuccess} onClose={() => setShowSuccess(false)} message="Client created successfully!" />
      {error && (
        <ErrorModal 
          isOpen={!!error} 
          onClose={() => setError(null)} 
          title={error.title} 
          message={error.message} 
        />
      )}
    </>
  )
}

