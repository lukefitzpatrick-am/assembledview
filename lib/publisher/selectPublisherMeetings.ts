/**
 * Publisher Hub meetings selection contract.
 * SQL equivalent: WHERE publisher_id = $id AND attributed_type = 'publisher'
 * ORDER BY meeting_date DESC, id DESC.
 */
export type PublisherMeeting = {
  id: number
  title: string | null
  meeting_date: string | null
  duration_seconds: number | null
  transcript_url: string | null
}

export type PublisherMeetingNote = {
  id: number
  publisherId: number | null
  attributedType: string | null
  title: string | null
  meetingDate: string | null
  durationSeconds: number | null
  transcriptUrl: string | null
}

function meetingDateMs(value: string | null): number {
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : 0
}

export function selectPublisherMeetings(
  notes: PublisherMeetingNote[],
  publisherId: number,
): PublisherMeeting[] {
  return notes
    .filter(
      (n) => n.publisherId === publisherId && n.attributedType === "publisher",
    )
    .toSorted((a, b) => {
      const byDate = meetingDateMs(b.meetingDate) - meetingDateMs(a.meetingDate)
      if (byDate !== 0) return byDate
      return b.id - a.id
    })
    .map((n) => ({
      id: n.id,
      title: n.title,
      meeting_date: n.meetingDate,
      duration_seconds: n.durationSeconds,
      transcript_url: n.transcriptUrl,
    }))
}
