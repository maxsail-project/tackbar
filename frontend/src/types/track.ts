export interface TrackSample {
  utc: string
  lat: number
  lon: number
  dist: number
  sog: number | null
  cog: number | null
  hdg: number | null
  heel: number | null
  trim: number | null
}

export interface ActivityTrack {
  activity_id: string
  samples: TrackSample[]
}
