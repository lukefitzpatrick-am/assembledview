import JSZip from "jszip"

const SLIDE_PATH = /^ppt\/slides\/slide\d+\.xml$/

/** Open a pptx and return its slide count. Throws when the package is unreadable or short. */
export async function assertDeckOpens(bytes: Buffer): Promise<number> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error("Deck file does not open")
  }
  const presentation = zip.file("ppt/presentation.xml")
  if (!presentation) throw new Error("Deck file does not open")
  const slides = Object.keys(zip.files).filter((name) => SLIDE_PATH.test(name))
  if (slides.length < 4) throw new Error(`Deck has ${slides.length} slides`)
  return slides.length
}
