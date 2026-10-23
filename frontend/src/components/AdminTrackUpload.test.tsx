import { type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminApiError } from '../api/adminApi'
import type { AdminIngestion, AdminSailor } from '../types/admin'
import { MAX_TRACK_UPLOAD_BYTES, submitTrackUpload, trackUploadError, trackUploadValidation, UploadTrackForm } from './AdminTrackUpload'

const sailors: AdminSailor[] = ['ACTIVE', 'PENDING', 'REVOKED'].map((status) => ({
  id: status, email: `${status.toLowerCase()}@example.test`, name: `${status} Sailor`, consent_status: status,
  consent_request_sent_at: null, consent_granted_at: null, consent_revoked_at: null,
  operational_group: status === 'ACTIVE' ? 'active' : status === 'REVOKED' ? 'revoked' : 'pending_needs_request',
  activity_count: 0, session_count: 0, last_sailing_start: null, last_sailing_end: null,
}))

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const element = node as ReactElement<Record<string, unknown>>
  return [element, ...elements(element.props.children as ReactNode)]
}

const props = () => ({ sailors, sailorId: '', file: null as File | null, uploading: false, error: null, inputKey: 0, onSailorChange: vi.fn(), onFileChange: vi.fn(), onSubmit: vi.fn() })
afterEach(() => vi.unstubAllGlobals())

describe('Admin single-track intake', () => {
  it.each([
    ['', false, true], ['ACTIVE', false, true], ['', true, true],
    ['PENDING', true, true], ['REVOKED', true, true], ['missing', true, true], ['ACTIVE', true, false],
  ])('gates submit for Sailor %s and file selection %s', (sailorId, selected, disabled) => {
    const view = UploadTrackForm({ ...props(), sailorId: String(sailorId),
      file: selected ? new File(['track'], 'pilot.gpx') : null })
    const button = elements(view).find((e) => e.type === 'button')!
    expect(button.props.disabled).toBe(disabled)
  })

  it('keeps selected invalid files actionable with useful validation feedback', () => {
    for (const file of [new File([], 'empty.gpx'), new File(['x'], 'pilot.zip'),
      new File([new Uint8Array(MAX_TRACK_UPLOAD_BYTES + 1)], 'large.gpx')]) {
      const error = trackUploadValidation(file, 'ACTIVE', sailors)
      expect(error).toBeTruthy()
      const view = UploadTrackForm({ ...props(), sailorId: 'ACTIVE', file, error })
      expect(elements(view).find((e) => e.type === 'button')!.props.disabled).toBe(false)
      expect(renderToStaticMarkup(view)).toContain('role="alert"')
      expect(renderToStaticMarkup(view)).toContain(error!)
    }
  })
  it('offers only existing ACTIVE Sailors with an explicit empty initial choice and one file', () => {
    const markup = renderToStaticMarkup(<UploadTrackForm {...props()} />)
    expect(markup).toContain('ACTIVE Sailor')
    expect(markup).toContain('Select a Sailor')
    expect(markup).not.toContain('PENDING Sailor')
    expect(markup).not.toContain('REVOKED Sailor')
    expect(markup).toContain('type="file"')
    expect(markup).not.toContain('multiple')
    expect(markup).not.toContain('type="email"')
    expect(markup).toContain('16 MiB')
    expect(markup).toContain('No automatic emails')
  })

  it('wires Sailor/file selection and submission to the upload interaction', () => {
    const callbacks = props()
    const view = UploadTrackForm(callbacks)
    const children = elements(view)
    const select = children.find((element) => element.type === 'select')!
    const input = children.find((element) => element.type === 'input')!
    const file = new File(['track'], 'pilot.GPX')
    ;(select.props.onChange as (event: unknown) => void)({ target: { value: 'ACTIVE' } })
    ;(input.props.onChange as (event: unknown) => void)({ target: { files: [file] } })
    expect(callbacks.onSailorChange).toHaveBeenCalledWith('ACTIVE')
    expect(callbacks.onFileChange).toHaveBeenCalledWith(file)
    expect(view.props.onSubmit).toBe(callbacks.onSubmit)
  })

  it('shows Uploading without percentages and disables only the intake fields', () => {
    const markup = renderToStaticMarkup(<UploadTrackForm {...props()} uploading />)
    expect(markup).toContain('>Uploading</button>')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('waiting for server acceptance')
    expect(markup.match(/disabled=""/g)).toHaveLength(3)
    expect(markup).not.toContain('progressbar')
    expect(markup).not.toContain('%')
  })

  it('explains the empty ACTIVE selection and disables submission', () => {
    const markup = renderToStaticMarkup(<UploadTrackForm {...props()} sailors={sailors.slice(1)} />)
    expect(markup).toContain('No ACTIVE Sailors')
    expect(markup).toContain('disabled="">Upload track')
  })

  it.each(['pilot.gpx', 'pilot.CSV', 'pilot.CSV.GZ', 'pilot.vkx', 'pilot.VKX.GZ'])('allows supported suffix %s', (name) => {
    expect(trackUploadValidation(new File(['content'], name), 'ACTIVE', sailors)).toBeNull()
  })

  it.each(['pilot.gpx.gz', 'pilot.gpx.zip', 'pilot.zip', 'pilot.fit'])('explains unsupported suffix %s', (name) => {
    expect(trackUploadValidation(new File(['content'], name), 'ACTIVE', sailors)).toContain('Unsupported format')
  })

  it('checks explicit eligibility, missing/empty input and both sides of the exact 16 MiB boundary', () => {
    const file = new File(['content'], 'pilot.gpx')
    for (const id of ['', 'missing', 'PENDING', 'REVOKED']) expect(trackUploadValidation(file, id, sailors)).toContain('ACTIVE')
    expect(trackUploadValidation(null, 'ACTIVE', sailors)).toContain('Choose one')
    expect(trackUploadValidation(new File([], 'empty.gpx'), 'ACTIVE', sailors)).toContain('empty')
    const bounded = new File([new Uint8Array(MAX_TRACK_UPLOAD_BYTES)], 'pilot.gpx')
    expect(trackUploadValidation(bounded, 'ACTIVE', sailors)).toBeNull()
    expect(trackUploadValidation(new File([bounded, 'x'], 'pilot.gpx'), 'ACTIVE', sailors)).toContain('16 MiB')
  })

  it.each(['pending', 'processing', 'processed', 'failed'] as const)('uses returned %s on durable acceptance without waiting for processing', async (status) => {
    let acknowledge!: (response: Response) => void
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { acknowledge = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['original bytes'], 'pilot #1.GPX')
    const onAccepted = vi.fn()
    const uploading = submitTrackUpload('secret', 'sailor/id', file, onAccepted)
    expect(onAccepted).not.toHaveBeenCalled()
    const waiting = UploadTrackForm({ ...props(), sailorId: 'ACTIVE', file, uploading: true })
    expect(elements(waiting).find((e) => e.type === 'button')!.props.disabled).toBe(true)
    expect(renderToStaticMarkup(waiting)).toContain('>Uploading</button>')
    // Navigating away has no cancellation handle for this request. The parent
    // receives the accepted record even when the upload view is no longer shown.
    acknowledge(new Response(JSON.stringify({ id: 'operation', status }), { status: 202 }))
    await uploading
    expect(onAccepted).toHaveBeenCalledWith({ id: 'operation', status })
    // Acknowledgement clears the selected file; a new file is required to submit again.
    const acknowledged = UploadTrackForm({ ...props(), sailorId: 'ACTIVE', file: null })
    expect(elements(acknowledged).find((e) => e.type === 'button')!.props.disabled).toBe(true)
    expect(renderToStaticMarkup(acknowledged)).not.toContain('>Uploading</button>')
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('sailor_id=sailor%2Fid&filename=pilot+%231.GPX')
    expect(options).toMatchObject({ method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-TackBar-Admin-Key': 'secret' } })
    expect(options).not.toHaveProperty('signal')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([401, 413, 422, 503])('does not report rejected HTTP %i as accepted', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    const accepted = vi.fn<(record: AdminIngestion) => void>()
    await expect(submitTrackUpload('key', 'ACTIVE', new File(['x'], 'a.gpx'), accepted)).rejects.toMatchObject({ status })
    expect(accepted).not.toHaveBeenCalled()
    const message = trackUploadError(new AdminApiError(status))
    expect(message).toMatch(status === 413 ? /16 MiB/ : status === 422 ? /ACTIVE/ : status === 401 ? /authorization/ : /worker/)
    expect(renderToStaticMarkup(<UploadTrackForm {...props()} error={message} />)).toContain('role="alert"')
  })

  it('does not invite a duplicate when the acceptance response is lost', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(submitTrackUpload('key', 'ACTIVE', new File(['x'], 'a.gpx'), vi.fn())).rejects.toMatchObject({ status: null })
    expect(trackUploadError(new AdminApiError(null))).toContain('Check Ingestions before uploading again')
  })
})
