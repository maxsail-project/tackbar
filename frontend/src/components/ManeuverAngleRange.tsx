import { useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react'
import { MANEUVER_ANGLE_RANGE as CONFIG } from '../config/maneuverProfile'

export type AngleBand = { minimum: number, maximum: number }
type Part = 'minimum' | 'maximum' | 'band'
export type AngleGesture = { pointerId: number, part: Part, startDegrees: number, startMinimum: number }

const snap = (value: number) => Math.round(value / CONFIG.step) * CONFIG.step
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

export function moveAngleBand(range: AngleBand, part: Part, requested: number): AngleBand {
  if (part === 'minimum') return { ...range, minimum: clamp(snap(requested), CONFIG.minimum, range.maximum - CONFIG.step) }
  if (part === 'maximum') return { ...range, maximum: clamp(snap(requested), range.minimum + CONFIG.step, CONFIG.maximum) }
  const width = range.maximum - range.minimum
  const minimum = clamp(snap(requested), CONFIG.minimum, CONFIG.maximum - width)
  return { minimum, maximum: minimum + width }
}

export function angleRangeKeyboard(range: AngleBand, part: Part, key: string): AngleBand | null {
  const current = part === 'maximum' ? range.maximum : range.minimum
  const requested = key === 'ArrowLeft' || key === 'ArrowDown' ? current - CONFIG.step
    : key === 'ArrowRight' || key === 'ArrowUp' ? current + CONFIG.step
      : key === 'Home' ? CONFIG.minimum : key === 'End' ? CONFIG.maximum : null
  return requested === null ? null : moveAngleBand(range, part, requested)
}

export function pointerAngleDegrees(clientX: number, left: number, width: number): number {
  if (width <= 0) return CONFIG.minimum
  return clamp((clientX - left) / width * CONFIG.maximum, CONFIG.minimum, CONFIG.maximum)
}

export function updateAngleGesture(range: AngleBand, gesture: AngleGesture, pointerId: number, degrees: number): AngleBand | null {
  if (pointerId !== gesture.pointerId) return null
  const requested = gesture.part === 'band'
    ? gesture.startMinimum + degrees - gesture.startDegrees
    : degrees
  return moveAngleBand(range, gesture.part, requested)
}

export default function ManeuverAngleRange({ range, onChange }: {
  range: AngleBand
  onChange: (range: AngleBand) => void
}) {
  const dragging = useRef<AngleGesture | null>(null)
  const percent = (angle: number) => `${angle / CONFIG.maximum * 100}%`
  function degrees(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return pointerAngleDegrees(event.clientX, bounds.left, bounds.width)
  }
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    const target = event.target as HTMLElement
    const part = target.closest<HTMLElement>('[data-angle-part]')?.dataset.anglePart as Part | undefined
    if (!part) return
    dragging.current = { pointerId: event.pointerId, part, startDegrees: degrees(event), startMinimum: range.minimum }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = dragging.current
    if (!gesture) return
    const next = updateAngleGesture(range, gesture, event.pointerId, degrees(event))
    if (next) onChange(next)
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, part: Part) {
    const next = angleRangeKeyboard(range, part, event.key)
    if (next) { event.preventDefault(); onChange(next) }
  }
  return (
    <div className="maneuver-angle-range">
      <div className="maneuver-angle-range__labels"><strong>Common |ΔCOG|</strong><span>{range.minimum}°–{range.maximum}°</span></div>
      <div className="maneuver-angle-range__bar" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={() => { dragging.current = null }} onPointerCancel={() => { dragging.current = null }}>
        <div className="maneuver-angle-range__track" />
        <div className="maneuver-angle-range__band" data-angle-part="band" style={{ left: percent(range.minimum), right: percent(CONFIG.maximum - range.maximum) }}
          role="slider" tabIndex={0} aria-label="Move angular band" aria-valuemin={CONFIG.minimum} aria-valuemax={CONFIG.maximum - (range.maximum - range.minimum)}
          aria-valuenow={range.minimum} aria-valuetext={`${range.minimum} to ${range.maximum} degrees`} onKeyDown={(event) => onKeyDown(event, 'band')} />
        {(['minimum', 'maximum'] as const).map((part) => <div key={part} className="maneuver-angle-range__handle" data-angle-part={part}
          style={{ left: percent(range[part]) }} role="slider" tabIndex={0} aria-label={`${part} course change`}
          aria-valuemin={part === 'minimum' ? CONFIG.minimum : range.minimum + CONFIG.step}
          aria-valuemax={part === 'minimum' ? range.maximum - CONFIG.step : CONFIG.maximum}
          aria-valuenow={range[part]} aria-valuetext={`${range[part]} degrees`} onKeyDown={(event) => onKeyDown(event, part)} />)}
      </div>
      <div className="maneuver-angle-range__bounds"><span>0°</span><span>180°</span></div>
    </div>
  )
}
