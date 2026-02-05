import { NextResponse } from "next/server"
import { getXanoBaseUrl } from "@/lib/api/xano"

type FileLike = Blob & { name?: string }

function isFileLike(value: unknown): value is FileLike {
  if (!value || typeof value !== "object") return false
  return typeof (value as any).arrayBuffer === "function"
}

type XanoPublicFile = {
  access: "public" | "private" | string
  path: string
  name: string
  type: string
  size: number
  mime: string
  meta: Record<string, any>
}

function isXanoPublicFile(value: any): value is XanoPublicFile {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.path === "string" &&
      typeof value.name === "string" &&
      typeof value.mime === "string"
  )
}

function inferFileTypeFromNameOrMime(name: string, mime: string): string {
  const lowerName = (name || "").toLowerCase()
  const lowerMime = (mime || "").toLowerCase()

  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf"
  if (
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls")
  ) {
    return lowerName.endsWith(".xls") ? "xls" : "xlsx"
  }
  if (lowerMime.includes("csv") || lowerName.endsWith(".csv")) return "csv"

  // Fallback: Xano often accepts a generic "attachment" type for non-media files.
  return "attachment"
}

function normalizeXanoPublicFile(meta: any): XanoPublicFile {
  const name = typeof meta?.name === "string" ? meta.name : "file"
  const mime = typeof meta?.mime === "string" ? meta.mime : "application/octet-stream"
  const type =
    typeof meta?.type === "string" && meta.type.trim()
      ? meta.type.trim()
      : inferFileTypeFromNameOrMime(name, mime)

  return {
    access: meta?.access ?? "public",
    path: String(meta?.path ?? ""),
    name,
    type,
    size: typeof meta?.size === "number" ? meta.size : Number(meta?.size ?? 0) || 0,
    mime,
    meta: (meta?.meta && typeof meta.meta === "object") ? meta.meta : {},
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "Missing version id" }, { status: 400 })
    }

    const incoming = await request.formData()
    const mediaPlan = incoming.get("media_plan")
    const mbaPdf = incoming.get("mba_pdf")
    const mpClientName = incoming.get("mp_client_name")

    const wantsMediaPlan = isFileLike(mediaPlan)
    const wantsMbaPdf = isFileLike(mbaPdf)

    // We include mp_client_name for potential future Xano logic, but it isn't required
    // for the upload/patch operations below.
    const hasAnyInput =
      wantsMediaPlan ||
      wantsMbaPdf ||
      (typeof mpClientName === "string" && mpClientName.trim().length > 0)

    if (!hasAnyInput || (!wantsMediaPlan && !wantsMbaPdf)) {
      return NextResponse.json(
        { error: "No files provided. Expected `media_plan` and/or `mba_pdf`." },
        { status: 400 }
      )
    }

    const baseUrl = getXanoBaseUrl(["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
    const saveFileBaseUrl = getXanoBaseUrl("XANO_SAVE_FILE_BASE_URL")
    const apiKey = process.env.XANO_API_KEY

    const authHeaders = {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }

    // Xano-recommended approach:
    // 1) Upload file to a dedicated upload endpoint -> returns Public File metadata
    // 2) PATCH the record with the metadata in the Public File fields
    const uploadAttachment = async (
      endpoint: "upload_mediaplan" | "upload_mba",
      file: FileLike,
      fallbackName: string
    ): Promise<XanoPublicFile> => {
      const form = new FormData()
      const fileName = (file as any).name || fallbackName

      // Per your Swagger for these endpoints: multipart field name is `content`
      form.append("content", file, fileName)
      // Some Xano upload endpoints require an explicit `type` input.
      // Xano’s standard values are: image | video | audio, with attachment as the default/elsewhere.
      // Your endpoint is for saving plan documents, so attachment is the correct choice.
      form.append("type", "attachment")
      // Some custom upload endpoints also require `access` (public/private).
      form.append("access", "public")

      // Belt-and-suspenders: some Xano endpoints treat non-file inputs as query params
      // even when called with multipart/form-data.
      const uploadUrl = new URL(`${saveFileBaseUrl}/${endpoint}`)
      uploadUrl.searchParams.set("type", "attachment")
      uploadUrl.searchParams.set("access", "public")

      const res = await fetch(uploadUrl.toString(), {
        method: "POST",
        headers: {
          ...authHeaders,
          // Do NOT set Content-Type for multipart; fetch will set boundary.
          Accept: "application/json",
        },
        body: form,
      })

      const contentType = res.headers.get("content-type") || ""
      const text = await res.text()
      if (!res.ok) {
        console.error("[documents upload] upload failed", {
          endpoint,
          status: res.status,
          contentType,
          body: text,
        })
        let parsed: any = null
        if (contentType.includes("application/json")) {
          try {
            parsed = JSON.parse(text)
          } catch {
            // ignore parse failures
          }
        }
        const details = parsed ?? text
        throw new Error(
          typeof details === "string" && details.trim()
            ? details
            : `Upload failed (${res.status}) to ${endpoint}`
        )
      }

      if (!contentType.includes("application/json")) {
        throw new Error("Upload succeeded but returned non-JSON response")
      }

      let json: any
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error("Upload succeeded but returned invalid JSON")
      }

      if (!isXanoPublicFile(json)) {
        throw new Error("Upload succeeded but response was not a Public File metadata object")
      }

      // Some upload endpoints return a metadata object missing `type` (but the media_plan_versions
      // Public File field requires it). Normalize defensively.
      return normalizeXanoPublicFile(json)
    }

    const patch: Record<string, any> = {}
    if (typeof mpClientName === "string" && mpClientName.trim()) {
      patch.mp_client_name = mpClientName.trim()
    }

    if (wantsMediaPlan) {
      patch.media_plan = await uploadAttachment("upload_mediaplan", mediaPlan, "media_plan.xlsx")
    }
    if (wantsMbaPdf) {
      patch.mba_pdf = await uploadAttachment("upload_mba", mbaPdf, "mba.pdf")
    }

    const patchRes = await fetch(`${baseUrl}/media_plan_versions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(patch),
    })

    const patchType = patchRes.headers.get("content-type") || ""
    const patchText = await patchRes.text()

    if (!patchRes.ok) {
      if (patchType.includes("application/json")) {
        try {
          return NextResponse.json(JSON.parse(patchText), { status: patchRes.status })
        } catch {
          return NextResponse.json({ error: patchText || "Invalid JSON from upstream" }, { status: patchRes.status })
        }
      }
      return new NextResponse(patchText, {
        status: patchRes.status,
        headers: { "content-type": patchType || "text/plain" },
      })
    }

    if (patchType.includes("application/json")) {
      try {
        return NextResponse.json(JSON.parse(patchText), { status: patchRes.status })
      } catch {
        // fall through
      }
    }

    return NextResponse.json({ ok: true }, { status: patchRes.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Failed to upload documents", details: message },
      { status: 500 }
    )
  }
}

