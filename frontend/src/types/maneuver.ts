export interface Maneuver {
  start_time: string
  center_time: string
  end_time: string
  heading_change_deg: number
  peak_turn_rate_deg_s: number
  peak_turn_rate_time: string
}

export interface ActivityManeuverAnalytics {
  activity_id: string
  status: 'available' | 'unavailable'
  reason?: string
  maneuvers: Maneuver[]
}
