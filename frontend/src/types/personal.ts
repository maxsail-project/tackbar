export interface PersonalWeather {
  air_temperature_c: number | null
  wind_speed_10m_kn: number | null
  wind_direction_10m_deg: number | null
}

export interface PersonalSession {
  sailing_start: string
  sailing_end: string
  sailor_count: number
  location_label: string | null
  location_country: string | null
  weather: PersonalWeather | null
  session_path: string | null
}

export interface PersonalTackBar {
  email: string
  name: string | null
  session_count: number
  last_sailing_end: string | null
  sessions: PersonalSession[]
}
