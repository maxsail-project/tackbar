export type SailingMetric = 'SOG' | 'COG' | 'HEEL' | 'TRIM'

export interface ParticipantOption {
  id: string
  name: string | null
  boat_name: string | null
  sail_number: string | null
}

export interface ActivityOption {
  activity_id: string
  participant: ParticipantOption
  start_time: string
  end_time: string
}

export interface SessionSummary {
  session_id: string
  date_label: string
  location_label: string
  start_time: string
  track_count: number
  activities: ActivityOption[]
}
