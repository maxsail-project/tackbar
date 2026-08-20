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

const mariano: ParticipantOption = {
  id: 'arroyomariano@hotmail.com',
  name: 'Mariano Arroyo',
  boat_name: 'El elegido',
  sail_number: 'ARG-32000',
}

export const mockSessions: SessionSummary[] = [
  {
    session_id: '00ef902a-d49d-44e2-9f4b-c3f258407b5f',
    date_label: '15 Aug',
    location_label: 'Sailing Area',
    start_time: '11:51',
    track_count: 2,
    activities: [
      {
        activity_id: '8c36e153-5186-4ba3-b19f-cfa2636ec5cd',
        participant: mariano,
        start_time: '2026-08-15T11:51:03.056000Z',
        end_time: '2026-08-16T09:06:16.057000Z',
      },
      {
        activity_id: '1ffdaa10-68b1-4770-90da-ec486326bcf2',
        participant: maxi,
        start_time: '2026-08-15T12:14:07.087000Z',
        end_time: '2026-08-15T14:17:11.075000Z',
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
