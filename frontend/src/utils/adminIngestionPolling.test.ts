import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminApiError } from '../api/adminApi'
import { pollAdminIngestions } from './adminIngestionPolling'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const response = (id: string, status: string) => new Response(JSON.stringify({ id, status }), { status: 200 })

describe('request-independent ingestion inspection', () => {
  it.each(['processed', 'failed'])('polls only active operations and stops after %s', async (terminal) => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(response('one', 'processing')).mockResolvedValueOnce(response('one', terminal))
    vi.stubGlobal('fetch', fetchMock)
    const update = vi.fn(), error = vi.fn()
    const stop = pollAdminIngestions('key', ['one'], update, error)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(update).toHaveBeenLastCalledWith({ id: 'one', status: 'processing' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(update).toHaveBeenLastCalledWith({ id: 'one', status: terminal })
    await vi.advanceTimersByTimeAsync(20000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/admin/ingestions/one')).toBe(true)
    expect(error).not.toHaveBeenCalled()
    stop()
  })

  it('continues only remaining active operations after one completes', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(response('one', 'processed')).mockResolvedValueOnce(response('two', 'pending')).mockResolvedValueOnce(response('two', 'processed'))
    vi.stubGlobal('fetch', fetchMock)
    const stop = pollAdminIngestions('key', ['one', 'two'], vi.fn(), vi.fn())
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/admin/ingestions/one', '/api/admin/ingestions/two', '/api/admin/ingestions/two'])
    stop()
  })

  it('stops timers on navigation, with no processing/retry request', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const stop = pollAdminIngestions('key', ['operation'], vi.fn(), vi.fn())
    stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts in-flight inspection and ignores its late result on navigation; returning can inspect the persisted result', async () => {
    vi.useFakeTimers()
    let finish!: (response: Response) => void
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve })).mockResolvedValueOnce(response('operation', 'processed'))
    vi.stubGlobal('fetch', fetchMock)
    const update = vi.fn(), error = vi.fn()
    const stop = pollAdminIngestions('key', ['operation'], update, error)
    await vi.advanceTimersByTimeAsync(2000)
    stop()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    finish(response('operation', 'processing'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(update).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    const stopAgain = pollAdminIngestions('key', ['operation'], update, error)
    await vi.advanceTimersByTimeAsync(2000)
    expect(update).toHaveBeenCalledWith({ id: 'operation', status: 'processed' })
    stopAgain()
  })

  it('does not overlap slow reads or retain polling after an inspection error', async () => {
    vi.useFakeTimers()
    let reject!: (error: Error) => void
    const fetchMock = vi.fn().mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    vi.stubGlobal('fetch', fetchMock)
    const error = vi.fn()
    const stop = pollAdminIngestions('key', ['operation'], vi.fn(), error)
    await vi.advanceTimersByTimeAsync(20000)
    expect(fetchMock).toHaveBeenCalledOnce()
    reject(new TypeError('offline'))
    await vi.advanceTimersByTimeAsync(20000)
    expect(error).toHaveBeenCalledWith(expect.any(AdminApiError))
    expect(fetchMock).toHaveBeenCalledOnce()
    stop()
  })

  it('does no reads with no active operations', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const stop = pollAdminIngestions('key', [], vi.fn(), vi.fn())
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).not.toHaveBeenCalled()
    stop()
  })
})
