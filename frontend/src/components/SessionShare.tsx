import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { SessionAccess, TemporarySessionShare } from '../types/session'
import TackBarBrand from './TackBarBrand'


export function formatRemainingLifetime(expiresAt: string, now = Date.now()) {
  const remainingMilliseconds = Date.parse(expiresAt) - now
  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
    return 'Expired'
  }
  const totalMinutes = Math.ceil(remainingMilliseconds / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function useRemainingLifetime(expiresAt: string) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [expiresAt])

  return formatRemainingLifetime(expiresAt, now)
}

export function temporaryShareUrl(path: string, origin: string) {
  return new URL(path, `${origin.replace(/\/$/, '')}/`).toString()
}

export function formatTemporaryAccessExpiry(
  expiresAt: string,
  locales?: Intl.LocalesArgument,
  timeZone?: string,
) {
  const expiry = new Date(expiresAt)
  if (!Number.isFinite(expiry.getTime())) return 'Unavailable'

  const timeZoneOption = timeZone ? { timeZone } : {}
  const date = new Intl.DateTimeFormat(locales, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...timeZoneOption,
  }).format(expiry)
  const time = new Intl.DateTimeFormat(locales, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...timeZoneOption,
  }).format(expiry)

  return `${date} · ${time}`
}

export function SessionViewerHeader() {
  return (
    <header className="app-header viewer-header">
      <TackBarBrand inverted />
    </header>
  )
}

export function SessionSummaryHeading({
  access,
  onShare,
}: {
  access: SessionAccess
  onShare?: () => void
}) {
  return (
    <div className="session-summary__heading">
      <div className="session-summary__title">
        <h1 id="session-summary-heading">
          {access.kind === 'temporary' ? 'Shared Session' : 'Session'}
        </h1>
        {access.kind === 'temporary' && (
          <p className="session-summary__availability">
            Available until {formatTemporaryAccessExpiry(access.expiresAt)}
          </p>
        )}
      </div>
      {access.kind === 'original' && onShare && (
        <button className="session-share-button" type="button" onClick={onShare}>
          <svg
            className="session-share-button__icon"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M1 1h6v6H1V1Zm2 2v2h2V3H3Zm6-2h6v6H9V1Zm2 2v2h2V3h-2ZM1 9h6v6H1V9Zm2 2v2h2v-2H3Zm6-2h2v2H9V9Zm4 0h2v4h-2V9Zm-4 4h4v2H9v-2Zm4 0h2v2h-2v-2Z" />
          </svg>
          <span>Share</span>
        </button>
      )}
    </div>
  )
}

export function SessionSharePanel({
  share,
  status,
  onClose,
  origin,
}: {
  share: TemporarySessionShare | null
  status: 'loading' | 'ready' | 'error'
  onClose: () => void
  origin: string
}) {
  const remaining = useRemainingLifetime(
    share?.expires_at ?? '1970-01-01T00:00:00Z',
  )
  const url = share ? temporaryShareUrl(share.path, origin) : null

  return (
    <div className="share-panel-backdrop" role="presentation">
      <section
        className="share-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-panel-title"
      >
        <div className="share-panel__heading">
          <h2 id="share-panel-title">Share Session</h2>
          <button type="button" onClick={onClose} aria-label="Close share panel">×</button>
        </div>
        {status === 'loading' && <p aria-live="polite">Preparing temporary access…</p>}
        {status === 'error' && (
          <p role="alert">Unable to prepare temporary access. Please try again.</p>
        )}
        {status === 'ready' && share && url && (
          <>
            <div className="share-panel__qr" aria-label="Temporary Session access QR code">
              <QRCodeSVG value={url} size={256} level="M" marginSize={2} />
            </div>
            <p className="share-panel__instruction">Scan to open this Session</p>
            <p className="share-panel__expiry">
              {remaining === 'Expired'
                ? 'Temporary access expired'
                : `Access expires in ${remaining}`}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
