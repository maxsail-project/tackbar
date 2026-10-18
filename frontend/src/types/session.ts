export const SAILING_METRICS = ['SOG', 'COG', 'HEEL', 'TRIM'] as const

export type SailingMetric = (typeof SAILING_METRICS)[number]

export type EnabledReplayMetric = Extract<SailingMetric, 'SOG' | 'COG'>

export interface SailorContext {
  id: string
  name: string | null
  email: string
}

export interface BoatContext {
  id: string
  name: string | null
  sailing_class: string | null
  sail_number: string | null
}

export interface SessionActivity {
  id: string
  source: string
  device_name: string
  original_filename: string
  start_time: string
  end_time: string
  sample_count: number
  sailor: SailorContext
  boat: BoatContext | null
}

export interface SessionListItem {
  id: string
  start_time: string
  end_time: string
  activity_count: number
}

export interface HistoricalConditionsSample {
  time: string
  air_temperature_c: number | null
  wind_speed_10m_kn: number | null
  wind_direction_10m_deg: number | null
  wind_gusts_10m_kn: number | null
  cloud_cover_pct: number | null
  wave_height_m: number | null
  wave_direction_deg: number | null
  wave_period_s: number | null
}

export interface HistoricalConditionsSource {
  provider: string
}

export interface HistoricalConditions {
  weather_source: HistoricalConditionsSource | null
  marine_source: HistoricalConditionsSource | null
  hourly: HistoricalConditionsSample[]
}

export interface SessionDetail {
  start_time: string
  end_time: string
  activities: SessionActivity[]
  location_label: string | null
  historical_conditions: HistoricalConditions | null
}

export interface SharedSessionDetail extends SessionDetail {
  session_access_expires_at: string
}

export interface TemporarySessionDetail extends SessionDetail {
  temporary_access_expires_at: string
}

export interface TemporarySessionShare {
  path: string
  expires_at: string
}

export type SessionAccess =
  | { kind: 'original', token: string }
  | { kind: 'temporary', token: string, expiresAt: string }
