import { useState, type FormEvent } from 'react'
import { AdminApiError, uploadAdminTrack } from '../api/adminApi'
import type { AdminIngestion, AdminSailor } from '../types/admin'

export const MAX_TRACK_UPLOAD_BYTES = 16 * 1024 * 1024
export const TRACK_FILE_ACCEPT = '.gpx,.csv,.csv.gz,.vkx,.vkx.gz'

export function trackUploadValidation(file: File | null, sailorId: string, sailors: AdminSailor[]) {
  if (!sailorId || !sailors.some((sailor) => sailor.id === sailorId && sailor.consent_status === 'ACTIVE')) return 'Select an existing ACTIVE Sailor.'
  if (!file) return 'Choose one track file.'
  if (file.size > MAX_TRACK_UPLOAD_BYTES) return 'The file exceeds the 16 MiB limit.'
  if (!/\.(gpx|csv|csv\.gz|vkx|vkx\.gz)$/i.test(file.name)) return 'Unsupported format. Choose .gpx, .csv, .csv.gz, .vkx or .vkx.gz. Compressed GPX and ZIP are not supported.'
  if (file.size === 0) return 'The file is empty. Choose a track file.'
  return null
}

export function trackUploadError(error: unknown) {
  if (!(error instanceof AdminApiError) || error.status === null) return 'Upload acceptance could not be confirmed. Check Ingestions before uploading again.'
  if (error.status === 401) return 'Admin authorization failed.'
  if (error.status === 413) return 'The file exceeds the 16 MiB limit.'
  if (error.status === 422) return 'The Sailor must still be ACTIVE and the filename must be valid. Refresh and check your selection.'
  if (error.status === 503) return 'Upload storage or worker is unavailable. Refresh Ingestions to check whether the file was accepted before trying again.'
  return 'Upload acceptance could not be confirmed. Check Ingestions before uploading again.'
}

// No request cancellation on navigation: only the server owns accepted work.
export async function submitTrackUpload(key: string, sailorId: string, file: File, onAccepted: (record: AdminIngestion) => void) {
  const record = await uploadAdminTrack(key, sailorId, file)
  onAccepted(record)
}

export default function AdminTrackUpload({ adminKey, sailors, onAccepted, onUnauthorized }: {
  adminKey: string; sailors: AdminSailor[]; onAccepted: (record: AdminIngestion) => void; onUnauthorized: (error: AdminApiError) => void
}) {
  const [sailorId, setSailorId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (uploading) return
    const validation = trackUploadValidation(file, sailorId, sailors)
    setError(validation)
    if (validation || !file) return
    setUploading(true)
    try {
      await submitTrackUpload(adminKey, sailorId, file, onAccepted)
      setFile(null); setInputKey((current) => current + 1)
    } catch (cause) {
      setError(trackUploadError(cause))
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setUploading(false) }
  }
  return <UploadTrackForm sailors={sailors} sailorId={sailorId} uploading={uploading} error={error} inputKey={inputKey} onSailorChange={setSailorId} onFileChange={setFile} onSubmit={(event) => void submit(event)} />
}

export function UploadTrackForm({ sailors, sailorId, uploading, error, inputKey, onSailorChange, onFileChange, onSubmit }: {
  sailors: AdminSailor[]; sailorId: string; uploading: boolean; error: string | null; inputKey: number
  onSailorChange: (id: string) => void; onFileChange: (file: File | null) => void; onSubmit: (event: FormEvent) => void
}) {
  const eligible = sailors.filter((sailor) => sailor.consent_status === 'ACTIVE')
  return <form className="admin-upload" aria-label="Upload track" onSubmit={onSubmit}>
    <h2>Upload track</h2>
    <p className="admin-meta">One file, up to 16 MiB: .gpx, .csv, .csv.gz, .vkx or .vkx.gz. Uses the Sailor’s default Boat. No automatic emails are sent.</p>
    <div className="admin-upload__fields">
      <label>Sailor (ACTIVE only)<select required value={sailorId} disabled={uploading || eligible.length === 0} onChange={(event) => onSailorChange(event.target.value)}><option value="">Select a Sailor</option>{eligible.map((sailor) => <option key={sailor.id} value={sailor.id}>{sailor.name ? `${sailor.name} · ${sailor.email}` : sailor.email}</option>)}</select></label>
      <label>Track file<input key={inputKey} required type="file" accept={TRACK_FILE_ACCEPT} disabled={uploading} onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} /></label>
    </div>
    {eligible.length === 0 && <p>No ACTIVE Sailors are available. Confirm consent in Sailors before uploading.</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-actions"><button className="admin-primary" disabled={uploading || eligible.length === 0}>{uploading ? 'Uploading' : 'Upload track'}</button></div>
    {uploading && <p role="status">Uploading — waiting for server acceptance. Keep this page open until acceptance is confirmed.</p>}
  </form>
}
