import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoatClassConfirmationRequiredError, createPersonalBoat, getPersonalBoatClasses,
  getPersonalBoats, getPersonalDefaultBoat, PersonalTackBarNotFoundError,
  updatePersonalBoat, updatePersonalDefaultBoat,
} from '../api/tackbarApi'
import type { PersonalBoat, PersonalBoatInput } from '../types/personal'

export function boatName(boat: PersonalBoat) {
  return [boat.name, boat.sailing_class, boat.sail_number].filter(Boolean).join(' · ')
}

type BoatState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; boats: PersonalBoat[]; classes: string[]; defaultId: string | null }

export default function MyBoats({ token, onUnavailable, onBoatSaved }: {
  token: string
  onUnavailable?: () => void
  onBoatSaved: (boat: PersonalBoat) => void
}) {
  const [state, setState] = useState<BoatState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  const [editing, setEditing] = useState<PersonalBoat | 'new' | null>(null)
  const [name, setName] = useState('')
  const [sailingClass, setSailingClass] = useState('')
  const [sailNumber, setSailNumber] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [confirmation, setConfirmation] = useState<BoatClassConfirmationRequiredError | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [defaultChoice, setDefaultChoice] = useState('')
  const [defaultMessage, setDefaultMessage] = useState<string | null>(null)
  const [defaultSaving, setDefaultSaving] = useState(false)
  const classInput = useRef<HTMLInputElement | null>(null)
  const confirmationAction = useRef<HTMLButtonElement | null>(null)
  const suggestionButtons = useRef<Array<HTMLButtonElement | null>>([])
  const boatWrite = useRef<AbortController | null>(null)
  const defaultWrite = useRef<AbortController | null>(null)
  const boatSubmitting = useRef(false)
  const defaultSubmitting = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    let denied = false
    const watchDenial = <T,>(request: Promise<T>) => request.catch((error: unknown) => {
      if (!controller.signal.aborted && !denied && error instanceof PersonalTackBarNotFoundError) {
        denied = true
        onUnavailable?.()
      }
      throw error
    })
    void Promise.allSettled([
      watchDenial(getPersonalBoats(token, controller.signal)),
      watchDenial(getPersonalBoatClasses(token, controller.signal)),
      watchDenial(getPersonalDefaultBoat(token, controller.signal)),
    ]).then(([boatResult, classResult, defaultResult]) => {
      if (controller.signal.aborted) return
      const errors = [boatResult, classResult, defaultResult].flatMap((result) => result.status === 'rejected' ? [result.reason as unknown] : [])
      if (errors.some((error) => error instanceof PersonalTackBarNotFoundError)) return
      if (errors.length || boatResult.status !== 'fulfilled' || classResult.status !== 'fulfilled' || defaultResult.status !== 'fulfilled') {
        setState({ status: 'error' }); return
      }
      const boats = boatResult.value
      const classes = classResult.value
      const currentDefault = defaultResult.value
      setState({ status: 'ready', boats, classes, defaultId: currentDefault.default_boat_id })
      setDefaultChoice(currentDefault.default_boat_id && !boats.some((boat) => boat.id === currentDefault.default_boat_id)
        ? '__keep__' : currentDefault.default_boat_id ?? '')
    })
    return () => controller.abort()
  }, [token, retry, onUnavailable])

  useEffect(() => () => { boatWrite.current?.abort(); defaultWrite.current?.abort() }, [])

  useEffect(() => { if (confirmation) confirmationAction.current?.focus() }, [confirmation])

  const suggestions = useMemo(() => {
    if (state.status !== 'ready' || !sailingClass.trim()) return []
    const query = sailingClass.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    return state.classes.filter((value) => value.toLocaleLowerCase().includes(query)).slice(0, 5)
  }, [sailingClass, state])

  function beginEdit(boat: PersonalBoat | 'new') {
    setEditing(boat)
    setName(boat === 'new' ? '' : boat.name ?? '')
    setSailingClass(boat === 'new' ? '' : boat.sailing_class ?? '')
    setSailNumber(boat === 'new' ? '' : boat.sail_number ?? '')
    setShowSuggestions(false)
    setConfirmation(null)
    setFormMessage(null)
    setSavedMessage(null)
  }

  async function saveBoat(classOverride?: string, confirmNewClass = false) {
    if (boatSubmitting.current || state.status !== 'ready' || editing === null) return
    const values: PersonalBoatInput = {
      name: name.trim() || null,
      sailing_class: (classOverride ?? sailingClass).trim() || null,
      sail_number: sailNumber.trim() || null,
    }
    if (!values.name && !values.sailing_class && !values.sail_number) {
      setFormMessage('Enter a Name, Class or Sail Number.')
      return
    }
    if (confirmNewClass) values.confirm_new_class = true
    boatSubmitting.current = true
    setSaving(true)
    setFormMessage(null)
    setConfirmation(null)
    setShowSuggestions(false)
    const controller = new AbortController()
    boatWrite.current = controller
    try {
      const saved = editing === 'new'
        ? await createPersonalBoat(token, values, controller.signal)
        : await updatePersonalBoat(token, editing.id, values, controller.signal)
      if (controller.signal.aborted) return
      setState((current) => current.status === 'ready' ? {
        ...current,
        boats: current.boats.some((boat) => boat.id === saved.id)
          ? current.boats.map((boat) => boat.id === saved.id ? saved : boat)
          : [...current.boats, saved],
        classes: saved.sailing_class && !current.classes.includes(saved.sailing_class)
          ? [...current.classes, saved.sailing_class].sort((a, b) => a.localeCompare(b))
          : current.classes,
      } : current)
      onBoatSaved(saved)
      setEditing(null)
      setSavedMessage('Boat saved.')
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof PersonalTackBarNotFoundError) onUnavailable?.()
      else if (error instanceof BoatClassConfirmationRequiredError) setConfirmation(error)
      else setFormMessage('Could not save Boat. Please try again.')
    } finally {
      boatSubmitting.current = false
      boatWrite.current = null
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  async function saveDefault() {
    if (defaultSubmitting.current || state.status !== 'ready' || defaultChoice === '__keep__'
        || defaultChoice === (state.defaultId ?? '')) return
    defaultSubmitting.current = true
    setDefaultSaving(true)
    setDefaultMessage(null)
    const controller = new AbortController()
    defaultWrite.current = controller
    try {
      const updated = await updatePersonalDefaultBoat(token, defaultChoice || null, controller.signal)
      if (controller.signal.aborted) return
      setState((current) => current.status === 'ready'
        ? { ...current, defaultId: updated.default_boat_id } : current)
      setDefaultChoice(updated.default_boat_id ?? '')
      setDefaultMessage('Default Boat saved.')
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof PersonalTackBarNotFoundError) onUnavailable?.()
      else setDefaultMessage('Could not save Default Boat. Please try again.')
    } finally {
      defaultSubmitting.current = false
      defaultWrite.current = null
      if (!controller.signal.aborted) setDefaultSaving(false)
    }
  }

  return <section aria-labelledby="my-boats-heading" className="personal-boats">
    <h2 id="my-boats-heading">My Boats</h2>
    {state.status === 'loading' && <p className="personal-feedback" role="status">Loading My Boats…</p>}
    {state.status === 'error' && <div className="personal-feedback" role="alert">Could not load My Boats. <button className="personal-action personal-action--secondary" type="button" onClick={() => { setState({ status: 'loading' }); setRetry((value) => value + 1) }}>Retry</button></div>}
    {state.status === 'ready' && <>
      {state.boats.length === 0 ? <p>No Boats registered yet.</p> : <ul className="personal-boats__list">{state.boats.map((boat) => <li key={boat.id}>
        <span className="personal-boats__name">{boatName(boat)}</span>
        <button className="personal-action personal-action--edit" type="button" aria-label={`Edit Boat ${boatName(boat)}`} disabled={saving} onClick={() => beginEdit(boat)}>Edit Boat</button>
      </li>)}</ul>}
      <button className="personal-action personal-action--secondary personal-boats__add" type="button" disabled={saving} onClick={() => beginEdit('new')}>Add Boat</button>
      {savedMessage && <p className="personal-feedback" role="status">{savedMessage}</p>}

      {editing !== null && <form className="personal-boats__form" onSubmit={(event) => { event.preventDefault(); void saveBoat() }}>
        <h3>{editing === 'new' ? 'Add Boat' : 'Edit Boat'}</h3>
        <label>Name<input type="text" value={name} disabled={saving} onChange={(event) => setName(event.target.value)} /></label>
        <label>Class<input ref={classInput} type="text" value={sailingClass} disabled={saving}
          aria-describedby="boat-class-help" aria-controls={showSuggestions && suggestions.length ? 'boat-class-suggestions' : undefined}
          onFocus={() => setShowSuggestions(true)}
          onChange={(event) => { setSailingClass(event.target.value); setConfirmation(null); setFormMessage(null); setShowSuggestions(true) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowSuggestions(false)
            if (event.key === 'ArrowDown' && showSuggestions && suggestions.length) {
              event.preventDefault(); suggestionButtons.current[0]?.focus()
            }
          }} />
        </label>
        <span id="boat-class-help" className="personal-boats__help">Optional free text. Choose a suggestion or enter a new Class.</span>
        {showSuggestions && suggestions.length > 0 && <ul id="boat-class-suggestions" className="personal-boats__suggestions" aria-label="Known Class suggestions">
          {suggestions.map((value, index) => <li key={value}><button className="personal-action personal-action--secondary" type="button" disabled={saving}
            ref={(node) => { suggestionButtons.current[index] = node }}
            onClick={() => { setSailingClass(value); setConfirmation(null); classInput.current?.focus(); setShowSuggestions(false) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { classInput.current?.focus(); setShowSuggestions(false) }
              if (event.key === 'ArrowDown') { event.preventDefault(); suggestionButtons.current[index + 1]?.focus() }
              if (event.key === 'ArrowUp') { event.preventDefault(); (suggestionButtons.current[index - 1] ?? classInput.current)?.focus() }
            }}>{value}</button></li>)}
        </ul>}
        <label>Sail Number<input type="text" value={sailNumber} disabled={saving} onChange={(event) => setSailNumber(event.target.value)} /></label>
        {confirmation && <div className="personal-boats__confirmation" role="alert">
          <p>Use known Class “{confirmation.suggestedClass}” for “{confirmation.submittedClass}”, or keep the new spelling?</p>
          <button className="personal-action personal-action--secondary" ref={confirmationAction} type="button" disabled={saving} onClick={() => { setSailingClass(confirmation.suggestedClass); void saveBoat(confirmation.suggestedClass) }}>Use {confirmation.suggestedClass}</button>
          <button className="personal-action personal-action--secondary" type="button" disabled={saving} onClick={() => { void saveBoat(confirmation.submittedClass, true) }}>Keep {confirmation.submittedClass}</button>
        </div>}
        {formMessage && <p className="personal-feedback" role="alert">{formMessage}</p>}
        <div className="personal-activity__actions">
          <button className="personal-action personal-action--primary" type="submit" disabled={saving || !!confirmation}>Save Boat</button>
          <button className="personal-action personal-action--secondary" type="button" disabled={saving} onClick={() => { setEditing(null); setConfirmation(null); setFormMessage(null) }}>Cancel</button>
        </div>
        {saving && <p className="personal-feedback" role="status">Saving Boat…</p>}
      </form>}

      <div className="personal-boats__default">
        <h3>Default Boat</h3>
        <p>Current: {state.defaultId
          ? (state.boats.find((boat) => boat.id === state.defaultId)
              ? boatName(state.boats.find((boat) => boat.id === state.defaultId)!) : 'Historical or unavailable Boat')
          : 'No default Boat'}</p>
        <label>Choose Default Boat
          <select value={defaultChoice} disabled={defaultSaving} onChange={(event) => { setDefaultChoice(event.target.value); setDefaultMessage(null) }}>
            {state.defaultId && !state.boats.some((boat) => boat.id === state.defaultId) && <option value="__keep__">Keep current default</option>}
            <option value="">No default Boat</option>
            {state.boats.map((boat) => <option key={boat.id} value={boat.id}>{boatName(boat)}</option>)}
          </select>
        </label>
        <div className="personal-activity__actions">
          <button className="personal-action personal-action--primary" type="button" disabled={defaultSaving || defaultChoice === '__keep__' || defaultChoice === (state.defaultId ?? '')} onClick={() => { void saveDefault() }}>Save Default Boat</button>
          <button className="personal-action personal-action--secondary" type="button" disabled={defaultSaving || defaultChoice === (state.defaultId && !state.boats.some((boat) => boat.id === state.defaultId) ? '__keep__' : state.defaultId ?? '')}
            onClick={() => { setDefaultChoice(state.defaultId && !state.boats.some((boat) => boat.id === state.defaultId) ? '__keep__' : state.defaultId ?? ''); setDefaultMessage(null) }}>Cancel Default Boat</button>
        </div>
        {defaultSaving && <p className="personal-feedback" role="status">Saving Default Boat…</p>}
        {defaultMessage && <p className="personal-feedback" role={defaultMessage.startsWith('Could not') ? 'alert' : 'status'}>{defaultMessage}</p>}
      </div>
    </>}
  </section>
}
