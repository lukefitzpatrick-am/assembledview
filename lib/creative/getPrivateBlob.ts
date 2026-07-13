import { get, type GetBlobResult, type GetCommandOptions } from "@vercel/blob"

type GetPrivateBlobOptions = Omit<GetCommandOptions, "access">

/**
 * Private blob read that prefers an explicit `BLOB_READ_WRITE_TOKEN`.
 *
 * `@vercel/blob` resolveBlobAuth prioritises OIDC when both an OIDC token
 * (from `@vercel/oidc` / Vercel CLI) and `BLOB_STORE_ID` are present — even if
 * `BLOB_READ_WRITE_TOKEN` is set. Locally that OIDC token often cannot read
 * private blobs (403), while the RW token works. Passing `token` always wins
 * per SDK docs.
 */
export async function getPrivateBlob(
  urlOrPathname: string,
  options?: GetPrivateBlobOptions,
): Promise<GetBlobResult | null> {
  const token = options?.token ?? process.env.BLOB_READ_WRITE_TOKEN
  return get(urlOrPathname, {
    ...options,
    access: "private",
    ...(token ? { token } : {}),
  })
}
