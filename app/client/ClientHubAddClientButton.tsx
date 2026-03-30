'use client'

import { useState } from 'react'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AddClientForm } from '@/components/AddClientForm'

export function ClientHubAddClientButton() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new client</DialogTitle>
        </DialogHeader>
        <AddClientForm
          onSuccess={() => {
            setOpen(false)
            window.location.reload()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
