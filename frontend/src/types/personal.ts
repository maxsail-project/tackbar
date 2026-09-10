export interface PersonalSession {
  sailing_start: string
  sailing_end: string
  sailor_count: number
  session_path: string | null
}

export interface PersonalTackBar {
  email: string
  name: string | null
  session_count: number
  last_sailing_end: string | null
  sessions: PersonalSession[]
}
