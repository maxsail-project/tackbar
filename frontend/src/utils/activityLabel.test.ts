import { describe, expect, it } from 'vitest'
import type { SessionActivity } from '../types/session'
import { formatActivityIdentity, formatActivityLabel } from './activityLabel'

function activity(overrides: Partial<SessionActivity> = {}): SessionActivity {
  return {
    id: 'activity-1',
    source: 'vakaros',
    device_name: 'device',
    original_filename: 'track.csv.gz',
    start_time: '2031-06-15T08:03:00Z',
    end_time: '2031-06-15T10:42:00Z',
    sample_count: 100,
    sailor: {
      id: 'sailor-internal-id',
      name: 'Sailor A',
      email: 'sailor-a@example.com',
    },
    boat: {
      id: 'boat-1',
      name: 'Demo Boat A',
      sailing_class: 'Snipe',
      sail_number: 'DEMO-1001',
    },
    ...overrides,
  }
}

describe('Activity presentation labels', () => {
  it('prioritizes Boat sail number and keeps Activity time', () => {
    expect(formatActivityLabel(activity())).toBe('DEMO-1001 · 08:03–10:42')
  })

  it('falls back to Boat name', () => {
    expect(formatActivityIdentity(activity({
      boat: {
        id: 'boat-1',
        name: 'Demo Boat A',
        sailing_class: null,
        sail_number: null,
      },
    }))).toBe('Demo Boat A')
  })

  it('falls back to Sailor name when Activity Boat context is unknown', () => {
    expect(formatActivityIdentity(activity({ boat: null }))).toBe('Sailor A')
  })

  it('falls back to Sailor email', () => {
    expect(formatActivityIdentity(activity({
      boat: null,
      sailor: {
        id: 'sailor-internal-id',
        name: null,
        email: 'sailor-a@example.com',
      },
    }))).toBe('sailor-a@example.com')
  })

  it('uses the internal Sailor id only when no human identity is available', () => {
    expect(formatActivityIdentity(activity({
      boat: null,
      sailor: { id: 'sailor-internal-id', name: null, email: ' ' },
    }))).toBe('sailor-internal-id')
  })
})
