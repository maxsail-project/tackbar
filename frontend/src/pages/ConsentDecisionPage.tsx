import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  acceptConsentRequest,
  ConsentUnavailableError,
  getConsentRequest,
} from '../api/tackbarApi'
import TackBarBrand from '../components/TackBarBrand'
import type { PublicConsent } from '../types/consent'

export type ConsentPageState =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'ready' | 'submitting' | 'confirmed'; data: PublicConsent }

export function consentStateFromResponse(data: PublicConsent): ConsentPageState {
  return { status: data.status, data }
}

export function createSingleFlight<T>(task: () => Promise<T>) {
  let inFlight: Promise<T> | null = null
  return () => {
    if (inFlight === null) {
      inFlight = task().finally(() => { inFlight = null })
    }
    return inFlight
  }
}

export default function ConsentDecisionPage() {
  const { token = '' } = useParams<{ token: string }>()
  return <ConsentPage key={token} token={token} />
}

function ConsentPage({ token }: { token: string }) {
  const [state, setState] = useState<ConsentPageState>({ status: 'loading' })
  const [readAttempt, setReadAttempt] = useState(0)
  const acceptOnce = useMemo(
    () => createSingleFlight(() => acceptConsentRequest(token)),
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    void getConsentRequest(token, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState(consentStateFromResponse(data))
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: error instanceof ConsentUnavailableError ? 'unavailable' : 'error',
          })
        }
      },
    )
    return () => controller.abort()
  }, [readAttempt, token])

  async function confirmParticipation() {
    if (state.status !== 'ready') return
    setState({ status: 'submitting', data: state.data })
    try {
      const data = await acceptOnce()
      setState(consentStateFromResponse(data))
    } catch (error) {
      setState({
        status: error instanceof ConsentUnavailableError ? 'unavailable' : 'error',
      })
    }
  }

  function retryRead() {
    setState({ status: 'loading' })
    setReadAttempt((attempt) => attempt + 1)
  }

  return (
    <ConsentDecisionContent
      state={state}
      onConfirm={() => { void confirmParticipation() }}
      onRetry={retryRead}
    />
  )
}

export function ConsentDecisionContent({
  state,
  onConfirm,
  onRetry,
}: {
  state: ConsentPageState
  onConfirm: () => void
  onRetry: () => void
}) {
  const isDecision = state.status === 'ready' || state.status === 'submitting'
  return <div className="consent-shell">
    <header className="app-header consent-header"><TackBarBrand inverted /></header>
    <main className="consent-page">
      <section className="consent-card" aria-live="polite">
        {state.status === 'loading' && <>
          <h1>Participation request<br /><span>Solicitud de participación</span></h1>
          <p role="status" className="consent-status">
            <span>Loading participation request…</span>
            <span lang="es">Cargando solicitud de participación…</span>
          </p>
        </>}

        {isDecision && <>
          <h1>Confirm TackBar participation<br /><span>Confirma tu participación en TackBar</span></h1>
          <div className="consent-languages">
            <section lang="en" aria-labelledby="consent-summary-en">
              <h2 id="consent-summary-en">English</h2>
              <p>TackBar has received a sailing activity associated with this participation request.</p>
              <p>Your participation is still pending.</p>
              <p>While participation remains pending, your activity is not exposed through shared TackBar Sessions.</p>
              <p>Please review the participation conditions before confirming.</p>
            </section>
            <section lang="es" aria-labelledby="consent-summary-es">
              <h2 id="consent-summary-es">Español</h2>
              <p>TackBar ha recibido una actividad de navegación asociada a esta solicitud de participación.</p>
              <p>Tu participación todavía está pendiente.</p>
              <p>Mientras tu participación esté pendiente, tu actividad no se muestra a través de Sessions compartidas de TackBar.</p>
              <p>Revisa las condiciones de participación antes de confirmar.</p>
            </section>
          </div>
          <p className="consent-version">Agreement version / Versión del acuerdo: <strong>{state.data.agreement_version}</strong></p>
          <Link className="consent-conditions-link" to="/consent/conditions">
            Participation conditions / Condiciones de participación
          </Link>
          <button
            className="consent-confirm"
            type="button"
            disabled={state.status === 'submitting'}
            onClick={onConfirm}
          >
            Confirm participation / Confirmar participación
          </button>
          {state.status === 'submitting' && <p role="status" className="consent-progress">
            <span>Confirming participation…</span>
            <span lang="es">Confirmando participación…</span>
          </p>}
        </>}

        {state.status === 'confirmed' && <>
          <h1>Participation confirmed<br /><span>Participación confirmada</span></h1>
          <div className="consent-confirmed" role="status">
            <p>Your TackBar participation is now active.</p>
            <p lang="es">Tu participación en TackBar ya está activa.</p>
          </div>
        </>}

        {state.status === 'unavailable' && <>
          <h1>Participation link unavailable<br /><span>Enlace de participación no disponible</span></h1>
          <div className="consent-message" role="alert">
            <p>This participation link is unavailable or has expired.</p>
            <p lang="es">Este enlace de participación no está disponible o ha caducado.</p>
          </div>
        </>}

        {state.status === 'error' && <>
          <h1>Temporary problem<br /><span>Problema temporal</span></h1>
          <div className="consent-message" role="alert">
            <p>We could not load this participation request. Please try again.</p>
            <p lang="es">No hemos podido cargar esta solicitud de participación. Inténtalo de nuevo.</p>
          </div>
          <button className="consent-retry" type="button" onClick={onRetry}>
            Retry / Reintentar
          </button>
        </>}
      </section>
    </main>
  </div>
}
