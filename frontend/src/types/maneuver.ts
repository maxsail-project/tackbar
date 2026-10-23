export interface Maneuver {
  start_time: string
  center_time: string
  end_time: string
  heading_change_deg: number | null
  course_change_deg: number | null
  peak_turn_rate_deg_s: number | null
  peak_turn_rate_time: string | null
  duration_s: number
  sog_entry_kn?: number | null
  sog_min_kn?: number | null
  sog_exit_kn?: number | null
  recovery_time_s?: number | null
  speed_loss_distance_m?: number | null
  speed_loss_time_s?: number | null
}

export interface ActivityManeuverAnalytics {
  activity_id: string
  status: 'available' | 'unavailable'
  detector_mode: 'HIGH' | 'LOW' | null
  signal_basis: ('hdg' | 'cog' | 'heel' | 'sog')[]
  reason?: string | null
  maneuvers: Maneuver[]
}
