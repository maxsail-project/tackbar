import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import TackBarBrand from './TackBarBrand'

const releaseNotesUrl = 'https://github.com/maxsail-project/tackbar/releases/latest'

function ReleaseNotesLink({ children = 'Release notes', className }: { children?: ReactNode; className?: string }) {
  return <a className={className} href={releaseNotesUrl} target="_blank" rel="noopener noreferrer">{children}</a>
}

export function formatReleaseIdentity(family?: string, version?: string) {
  return [family?.trim(), version?.trim()].filter(Boolean).join(' · ')
}

export function PublicHeaderBrand({
  family = import.meta.env.VITE_APP_RELEASE_FAMILY,
  version = import.meta.env.VITE_APP_VERSION,
}: {
  family?: string
  version?: string
}) {
  const releaseFamily = family?.trim()
  return <div className="public-header-brand">
    <TackBarBrand inverted />
    <span className="public-header-release">
      {releaseFamily && `${releaseFamily} · `}
      <ReleaseNotesLink className="public-header-release__link">
        <span>{version?.trim() || 'Release notes'}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M9 2h5v5m0-5-7 7m-1-6H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" />
        </svg>
      </ReleaseNotesLink>
    </span>
  </div>
}

export function AboutDialog({
  dialogRef,
  onClose,
  onDismiss,
  family,
  version,
}: {
  dialogRef?: RefObject<HTMLDialogElement | null>
  onClose: () => void
  onDismiss: () => void
  family?: string
  version?: string
}) {
  const releaseIdentity = formatReleaseIdentity(family, version)
  return <dialog className="about-dialog" ref={dialogRef} onClose={onClose} aria-labelledby="about-title">
    <div className="about-dialog__heading">
      <h2 id="about-title">About TackBar</h2>
      <button type="button" onClick={onDismiss} aria-label="Close About">×</button>
    </div>
    <p className="about-dialog__tagline">Sail. Debrief. Learn.</p>
    <p>TackBar is an independent open-source project for collaborative post-sailing debriefing.</p>
    <p>TackBar supports the conversation. It doesn&apos;t replace it.</p>
    <p className="about-dialog__status">Experimental pilot</p>
    <p>Created by Maximiliano Mannise <a className="about-dialog__li" href="https://www.linkedin.com/in/mmannise" target="_blank" rel="noopener noreferrer" aria-label="Maximiliano Mannise on LinkedIn">LI</a>.</p>
    <p>Contact: <a href="mailto:hello@tackbar.eu">hello@tackbar.eu</a></p>
    <p>Website: <a href="https://tackbar.eu" target="_blank" rel="noopener noreferrer">tackbar.eu</a></p>
    <p>Source: <a href="https://github.com/maxsail-project/tackbar" target="_blank" rel="noopener noreferrer">GitHub</a> · <a href="https://github.com/maxsail-project/tackbar/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MPL-2.0 license</a></p>
    {releaseIdentity && <p className="about-dialog__release">{releaseIdentity}</p>}
    <p><ReleaseNotesLink /></p>
  </dialog>
}

export default function AboutControl({
  family = import.meta.env.VITE_APP_RELEASE_FAMILY,
  version = import.meta.env.VITE_APP_VERSION,
}: {
  family?: string
  version?: string
}) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [open])

  function close() {
    dialogRef.current?.close()
  }

  function onClose() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return <>
    <button className="about-trigger" type="button" ref={triggerRef} onClick={() => setOpen(true)}>About</button>
    {open && <AboutDialog dialogRef={dialogRef} onClose={onClose} onDismiss={close}
      family={family} version={version} />}
  </>
}
