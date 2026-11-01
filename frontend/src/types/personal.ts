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

export interface PersonalProfile {
  name: string | null
}

export interface PersonalBoat {
  id: string
  name: string | null
  sailing_class: string | null
  sail_number: string | null
}

export interface PersonalActivity {
  id: string
  boat_id: string | null
  boat: PersonalBoat | null
  device_name: string
  device_label: string | null
  source: string
  original_filename: string
  start_time: string
  end_time: string
}

export interface PersonalActivityPatch {
  boat_id?: string | null
  device_label?: string | null
}

export interface PersonalBoatInput {
  name?: string | null
  sailing_class?: string | null
  sail_number?: string | null
  confirm_new_class?: boolean
}

export interface PersonalDefaultBoat {
  default_boat_id: string | null
}
