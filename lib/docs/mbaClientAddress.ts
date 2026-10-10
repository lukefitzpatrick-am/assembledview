/**
 * MBA PDF client address lines. Draft and published both render through generateMBA.
 * Empty parts are omitted. Postcode 0 is the empty number input, not an address.
 * NSW with no street, suburb, or postcode is the add-client default, not an address.
 */

export type MbaAddressParts = {
  streetaddress?: string | number | null
  suburb?: string | number | null
  state?: string | number | null
  postcode?: string | number | null
}

const DEFAULT_CLIENT_STATE = "NSW"

function textPart(value: string | number | null | undefined): string {
  if (value == null) return ""
  return String(value).trim()
}

function postcodePart(value: string | number | null | undefined): string {
  const text = textPart(value)
  if (text === "" || text === "0") return ""
  return text
}

export function formatMbaClientAddressLines(parts: MbaAddressParts): string[] {
  const street = textPart(parts.streetaddress)
  const suburb = textPart(parts.suburb)
  const postcode = postcodePart(parts.postcode)
  let state = textPart(parts.state)
  const hasOtherPart = street !== "" || suburb !== "" || postcode !== ""
  if (!hasOtherPart && state === DEFAULT_CLIENT_STATE) state = ""

  const lines: string[] = []
  if (street !== "") lines.push(street)

  const stateAndPostcode = [state, postcode].filter((part) => part !== "").join(" ")
  const locality = [suburb, stateAndPostcode].filter((part) => part !== "").join(", ")
  if (locality !== "") lines.push(locality)
  return lines
}
