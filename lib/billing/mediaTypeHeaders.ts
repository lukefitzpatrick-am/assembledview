/** Column labels for manual billing / Excel export (aligned with media plan create UI). */
export function getMediaTypeHeadersForSchedule(mediaKey: string): { header1: string; header2: string } {
  switch (mediaKey) {
    case "television":
    case "radio":
      return { header1: "Network", header2: "Station" }
    case "newspaper":
    case "magazines":
      return { header1: "Network", header2: "Title" }
    case "digiDisplay":
    case "digiAudio":
    case "digiVideo":
    case "bvod":
      return { header1: "Publisher", header2: "Site" }
    case "search":
    case "socialMedia":
    case "progDisplay":
    case "progVideo":
    case "progBvod":
    case "progAudio":
    case "progOoh":
      return { header1: "Platform", header2: "Targeting" }
    case "ooh":
    case "cinema":
      return { header1: "Network", header2: "Format" }
    case "integration":
      return { header1: "Item", header2: "Details" }
    case "influencers":
      return { header1: "Platform", header2: "Details" }
    case "production":
      return { header1: "Production", header2: "Item" }
    default:
      return { header1: "Item", header2: "Details" }
  }
}
