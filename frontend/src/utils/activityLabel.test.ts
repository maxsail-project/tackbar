import { describe, expect, it } from 'vitest'
import type { SessionActivity } from '../types/session'
import {
  buildActivitySelectorLabels,
  formatActivityIdentity,
  formatActivityLabel,
  formatActivitySelectorLabel,
} from './activityLabel'

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

  it('falls back to Sailor email without displaying the domain', () => {
    expect(formatActivityIdentity(activity({
      boat: null,
      sailor: {
        id: 'sailor-internal-id',
        name: null,
        email: 'sailor-a@example.com',
      },
    }))).toBe('sailor-a@')
  })

  it('uses the internal Sailor id only when no human identity is available', () => {
    expect(formatActivityIdentity(activity({
      boat: null,
      sailor: { id: 'sailor-internal-id', name: null, email: ' ' },
    }))).toBe('sailor-internal-id')
  })

  it('hides the domain for an email-derived selector identity while retaining @ and time', () => {
    const emailActivity = activity({
      boat: null,
      device_name: ' ',
      sailor: { id: 'sailor-1', name: null, email: 'maxi@example.com' },
    })

    expect(formatActivitySelectorLabel(emailActivity)).toBe('maxi@ · 08:03–10:42')
    expect(formatActivityLabel(emailActivity)).toBe('maxi@ · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity({
      boat: null,
      device_name: '',
      sailor: { id: 'sailor-1', name: null, email: 'maxi+vakaros@example.com' },
    }))).toBe('maxi+vakaros@ · 08:03–10:42')
  })

  it('keeps non-email, Boat and Sailor-name selector identities unchanged', () => {
    expect(formatActivitySelectorLabel(activity({
      boat: null,
      device_name: '',
      sailor: { id: 'sailor-1', name: null, email: 'maxi' },
    }))).toBe('maxi · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity({ boat: null, device_name: '' }))).toBe('Sailor A · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity())).toBe('DEMO-1001 · 08:03–10:42')
  })

  it('uses Boat sail number, name, class, Device label, original Device, then Sailor in selectors only', () => {
    const classOnly = { id: 'boat-1', name: '  ', sailing_class: ' ILCA 7 ', sail_number: ' ' }
    expect(formatActivitySelectorLabel(activity({ boat: classOnly, device_label: 'Watch', device_name: 'Original' }))).toBe('ILCA 7 · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity({ boat: { ...classOnly, name: 'Sailboat' } }))).toBe('Sailboat · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity({ boat: null, device_label: ' Bow watch ', device_name: 'Original' }))).toBe('Bow watch · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity({ boat: null, device_label: ' \t ', device_name: ' Device A ' }))).toBe('Device A · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity({ boat: null, device_label: '', device_name: ' ' }))).toBe('Sailor A · 08:03–10:42')
    expect(formatActivityLabel(activity({ boat: null, device_label: 'Bow watch', device_name: 'Original' }))).toBe('Sailor A · 08:03–10:42')
  })

  it('falls back to shortened email and Sailor ID when Boat and Device are blank', () => {
    const noDevice = { boat: null, device_label: ' ', device_name: ' ' }
    expect(formatActivitySelectorLabel(activity({ ...noDevice, sailor: { id: 'id', name: ' ', email: 'sailor@example.com' } }))).toBe('sailor@ · 08:03–10:42')
    expect(formatActivitySelectorLabel(activity({ ...noDevice, sailor: { id: 'id', name: null, email: ' ' } }))).toBe('id · 08:03–10:42')
  })

  it('numbers only complete-label collisions by start time then stable Activity ID', () => {
    const same = (id: string, startTime = '2031-06-15T08:03:00Z') => activity({ id, start_time: startTime, boat: null, device_label: 'Watch' })
    const activities = [same('c'), same('a'), same('b'), same('later', '2031-06-15T09:03:00Z')]
    const labels = buildActivitySelectorLabels(activities)
    expect(labels.get('a')).toBe('Watch · 08:03–10:42 #1')
    expect(labels.get('b')).toBe('Watch · 08:03–10:42 #2')
    expect(labels.get('c')).toBe('Watch · 08:03–10:42 #3')
    expect(labels.get('later')).toBe('Watch · 09:03–10:42')
    for (const order of [[...activities].reverse(), [activities[2], activities[0], activities[3], activities[1]]]) {
      const reordered = buildActivitySelectorLabels(order)
      for (const item of activities) expect(reordered.get(item.id)).toBe(labels.get(item.id))
    }
  })

  it('leaves identical Boat identities unsuffixed when their UTC time labels differ', () => {
    const first = activity({ id: 'first' })
    const second = activity({ id: 'second', start_time: '2031-06-15T11:03:00Z', end_time: '2031-06-15T12:42:00Z' })
    const labels = buildActivitySelectorLabels([second, first])
    expect(labels.get('first')).toBe('DEMO-1001 · 08:03–10:42')
    expect(labels.get('second')).toBe('DEMO-1001 · 11:03–12:42')
  })

  it('uses the true start-time order when display minutes collide', () => {
    const earlier = activity({ id: 'z', boat: null, device_label: 'Watch', start_time: '2031-06-15T08:03:01Z' })
    const later = activity({ id: 'a', boat: null, device_label: 'Watch', start_time: '2031-06-15T08:03:59Z' })
    const labels = buildActivitySelectorLabels([later, earlier])
    expect(labels.get('z')).toMatch(/#1$/)
    expect(labels.get('a')).toMatch(/#2$/)
  })
})
