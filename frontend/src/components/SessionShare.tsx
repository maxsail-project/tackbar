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

export function SessionViewerHeader({
  access,
  onShare,
}: {
  access: SessionAccess
  onShare?: () => void
}) {
  return (
    <header className="app-header viewer-header">
      <div className="viewer-header__main">
        <TackBarBrand inverted />
        {access.kind === 'original' && onShare && (
          <button className="viewer-share-button" type="button" onClick={onShare}>
            Share / QR
          </button>
        )}
      </div>
      {access.kind === 'temporary' && (
        <TemporaryAccessIndicator expiresAt={access.expiresAt} />
      )}
    </header>
  )
}

function TemporaryAccessIndicator({ expiresAt }: { expiresAt: string }) {
  const remaining = useRemainingLifetime(expiresAt)
  return (
    <p className="temporary-access-indicator" aria-live="polite">
      Shared access · {remaining === 'Expired' ? remaining : `${remaining} left`}
    </p>
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
