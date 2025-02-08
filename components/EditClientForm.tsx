"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const clientSchema = z.object({
  id: z.number(),
  clientname_input: z.string().min(1, "Client name is required"),
  clientcategory: z.string().min(1, "Client category is required"),
  abn: z.number().int().positive(),
  mbaidentifier: z.string(),
  legalbusinessname: z.string().min(1, "Legal business name is required"),
  streetaddress: z.string().min(1, "Street address is required"),
  suburb: z.string().min(1, "Suburb is required"),
  state_dropdown: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT"]),
  postcode: z.number().int().min(1000).max(9999),
  keyfirstname: z.string().min(1, "Key contact first name is required"),
  keylastname: z.string().min(1, "Key contact last name is required"),
  keyphone: z.number().int().positive(),
  keyemail: z.string().email(),
  billingfirstname: z.string().min(1, "Billing contact first name is required"),
  billinglastname: z.string().min(1, "Billing contact last name is required"),
  billingphone: z.number().int().positive(),
  billingemail: z.string().email(),
  monthlyretainer: z.number().nonnegative(),
  organicsocial: z.number().nonnegative(),
  television_checkbox: z.boolean(),
  radio_checkbox: z.boolean(),
  newspapers_checkbox: z.boolean(),
  magazines_checkbox: z.boolean(),
  ooh_checkbox: z.boolean(),
  cinema_checkbox: z.boolean(),
  digitaldisplay_checkbox: z.boolean(),
  digitalaudio_checkbox: z.boolean(),
  digitalvideo_checkbox: z.boolean(),
  bvod_checkbox: z.boolean(),
  feesocial: z.number().nonnegative(),
  feesearch: z.number().nonnegative(),
  feeprogdisplay: z.number().nonnegative(),
  feeprogvideo: z.number().nonnegative(),
  feeprogbvod: z.number().nonnegative(),
  feeprogaudio: z.number().nonnegative(),
  feeprogooh: z.number().nonnegative(),
  feecontentcreator: z.number().nonnegative(),
  adservvideo: z.number().nonnegative(),
  adservimp: z.number().nonnegative(),
  adservdisplay: z.number().nonnegative(),
  adservaudio: z.number().nonnegative(),
  idgoogleads: z.string(),
  idmeta: z.string(),
  idcm360: z.string(),
  iddv360: z.string(),
  idtiktok: z.string(),
  idlinkedin: z.string(),
  idpinterest: z.string(),
  idquantcast: z.string(),
  idtaboola: z.string(),
  idsnapchat: z.string(),
  idbing: z.string(),
  idvistar: z.string(),
  idga4: z.string(),
  idmerchantcentre: z.string(),
  idshopify: z.string(),
})

type ClientFormValues = z.infer<typeof clientSchema>

interface EditClientFormProps {
  client: ClientFormValues
  onSuccess: () => void
}

export function EditClientForm({ client, onSuccess }: EditClientFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: client,
  })

  async function onSubmit(data: ClientFormValues) {
    setIsLoading(true)
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

      onSuccess()
    } catch (error) {
      console.error("Failed to update client:", error)
      // TODO: Show error message to user
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Include all form fields here, similar to AddClientForm */}
        {/* You can copy the form fields from AddClientForm and adjust as needed */}
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select State" />
          </SelectTrigger>
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

        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Updating..." : "Update Client"}
        </Button>
      </form>
    </Form>
  )
}

