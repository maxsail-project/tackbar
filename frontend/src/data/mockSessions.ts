import type { ParticipantOption, SessionSummary } from '../types/session'

const sailorA: ParticipantOption = {
  id: 'sailor-a@example.com',
  name: 'Sailor A',
  boat_name: 'Demo Boat A',
  sail_number: 'DEMO-1001',
}

const sailorB: ParticipantOption = {
  id: 'sailor-b@example.com',
  name: 'Sailor B',
  boat_name: 'Demo Boat B',
  sail_number: 'DEMO-1002',
}

const sailorC: ParticipantOption = {
  id: 'sailor-c@example.com',
  name: 'Sailor C',
  boat_name: null,
  sail_number: null,
}

const sailorD: ParticipantOption = {
  id: 'sailor-d@example.com',
  name: 'Sailor D',
  boat_name: 'Demo Boat D',
  sail_number: 'DEMO-1004',
}

export const mockSessions: SessionSummary[] = [
  {
    session_id: '20000000-0000-4000-8000-000000000001',
    date_label: '15 Jun',
    location_label: 'Demo Sailing Area',
    start_time: '08:00',
    track_count: 2,
    activities: [
      {
        activity_id: '10000000-0000-4000-8000-000000000001',
        participant: sailorA,
        start_time: '2031-06-15T08:00:00Z',
        end_time: '2031-06-16T05:15:13.001000Z',
      },
      {
        activity_id: '10000000-0000-4000-8000-000000000002',
        participant: sailorB,
        start_time: '2031-06-15T08:23:04.031000Z',
        end_time: '2031-06-15T10:26:08.019000Z',
      },
    ],
  },
  {
    session_id: '20000000-0000-4000-8000-000000000002',
    date_label: '18 Jun',
    location_label: 'Demo Sailing Area',
    start_time: '17:20',
    track_count: 2,
    activities: [
      {
        activity_id: '10000000-0000-4000-8000-000000000003',
        participant: sailorC,
        start_time: '2031-06-18T17:21:00Z',
        end_time: '2031-06-18T18:34:00Z',
      },
      {
        activity_id: '10000000-0000-4000-8000-000000000004',
        participant: sailorA,
        start_time: '2031-06-18T17:24:00Z',
        end_time: '2031-06-18T18:41:00Z',
      },
    ],
  },
  {
    session_id: '20000000-0000-4000-8000-000000000003',
    date_label: '16 Jun',
    location_label: 'Demo Sailing Area',
    start_time: '10:10',
    track_count: 2,
    activities: [
      {
        activity_id: '10000000-0000-4000-8000-000000000005',
        participant: sailorD,
        start_time: '2031-06-16T10:12:00Z',
        end_time: '2031-06-16T11:30:00Z',
      },
    ],
  },
]
