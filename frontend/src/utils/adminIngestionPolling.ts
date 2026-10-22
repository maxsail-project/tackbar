import { getAdminIngestion } from '../api/adminApi'
import type { AdminIngestion, AdminIngestionDetail } from '../types/admin'

export const ingestionIsRunning = (record: Pick<AdminIngestion, 'status'>) => record.status === 'pending' || record.status === 'processing'
export const ingestionStatusLabels: Record<AdminIngestion['status'], string> = { pending: 'Pending', processing: 'Processing', processed: 'Processed', failed: 'Failed' }

// One outstanding pass, only active Ingestions. Cleanup stops reads, never work.
export function pollAdminIngestions(key: string, ids: string[], onUpdate: (record: AdminIngestionDetail) => void, onError: (error: unknown) => void) {
  const active = new Set(ids)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const poll = async () => {
    try {
      for (const id of active) {
        const record = await getAdminIngestion(key, id, controller.signal)
        if (controller.signal.aborted) return
        if (!ingestionIsRunning(record)) active.delete(id)
        onUpdate(record)
      }
      if (active.size && !controller.signal.aborted) timer = setTimeout(() => void poll(), 2000)
    } catch (cause) {
      if (!controller.signal.aborted) onError(cause)
      // Stop on errors; explicit Refresh/navigation resumes inspection.
    }
  }
  if (active.size) timer = setTimeout(() => void poll(), 2000)
  return () => { controller.abort(); clearTimeout(timer) }
}
