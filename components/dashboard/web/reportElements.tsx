"use client"

import { ElementDisplay } from "@/components/dashboard/web/displays/ElementDisplay"
import { prepareWebElement } from "@/lib/webReport/displayModel"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"
import type { WebReportData } from "@/lib/webReport/types"

export function WebReportElement({ item, data }: { item: WebReportLayoutItem; data: WebReportData }) {
  return <ElementDisplay model={prepareWebElement(item, data)} />
}
