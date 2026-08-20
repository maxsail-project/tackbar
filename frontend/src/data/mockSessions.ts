import type { ParticipantOption, SessionSummary } from '../types/session'

const maxi: ParticipantOption = {
  id: 'mmannise@gmail.com',
  name: 'Maxi URU',
  boat_name: 'Zafar',
  sail_number: 'URU-32115',
}

const juan: ParticipantOption = {
  id: 'juan@example.com',
  name: 'Juan',
  boat_name: 'Brisa',
  sail_number: null,
}

const lucia: ParticipantOption = {
  id: 'lucia@example.com',
  name: 'Lucía',
  boat_name: null,
  sail_number: null,
}

const emailOnlyParticipant: ParticipantOption = {
  id: 'mmannise@icloud.com',
  name: null,
  boat_name: null,
  sail_number: null,
}

export const mockSessions: SessionSummary[] = [
  {
    session_id: 'local-session-19-aug',
    date_label: '19 Aug',
    location_label: 'Sailing Area',
    start_time: '11:05',
    track_count: 5,
    activities: [
      {
        activity_id: '0df54d24-249a-4cb4-a7d5-e24bd0b31fd1',
        participant: maxi,
        start_time: '2026-08-19T11:03:00Z',
        end_time: '2026-08-19T12:42:00Z',
      },
      {
        activity_id: 'b90e0be7-80e1-4e95-85e0-95462fef6559',
        participant: juan,
        start_time: '2026-08-19T11:08:00Z',
        end_time: '2026-08-19T11:47:00Z',
      },
      {
        activity_id: '6d034deb-9237-4492-8f50-6db395a43b30',
        participant: maxi,
        start_time: '2026-08-19T12:01:00Z',
        end_time: '2026-08-19T12:39:00Z',
      },
      {
        activity_id: '397e2ffc-9dab-4c92-a702-b250581eca6b',
        participant: lucia,
        start_time: '2026-08-19T11:12:00Z',
        end_time: '2026-08-19T12:08:00Z',
      },
      {
        activity_id: 'df2eb8bb-5d2a-47d2-a2dd-ebbb7ac4f338',
        participant: emailOnlyParticipant,
        start_time: '2026-08-19T11:15:00Z',
        end_time: '2026-08-19T11:59:00Z',
      },
    ],
  },
  {
    session_id: 'local-session-18-aug',
    date_label: '18 Aug',
    location_label: 'Sailing Area',
    start_time: '17:20',
    track_count: 3,
    activities: [
      {
        activity_id: 'a13630db-e4ca-4ffd-a6b9-a558826e1c24',
        participant: lucia,
        start_time: '2026-08-18T17:21:00Z',
        end_time: '2026-08-18T18:34:00Z',
      },
      {
        activity_id: 'a5945692-fbb4-4a5c-9728-b347cc9b2afd',
        participant: maxi,
        start_time: '2026-08-18T17:24:00Z',
        end_time: '2026-08-18T18:41:00Z',
      },
    ],
  },
  {
    session_id: 'local-session-16-aug',
    date_label: '16 Aug',
    location_label: 'Sailing Area',
    start_time: '10:10',
    track_count: 2,
    activities: [
      {
        activity_id: '260ec2e1-c01c-46ed-9544-74959733c699',
        participant: juan,
        start_time: '2026-08-16T10:12:00Z',
        end_time: '2026-08-16T11:30:00Z',
      },
    ],
  },
]
