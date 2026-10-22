// Offline real-backend browser gate. Run after `npm run build`:
// node tests/adminUploadBackend.mjs
// Override TACKBAR_TEST_PYTHON / TACKBAR_TEST_BROWSER when needed.
// Requires an installed Chromium browser; uses native CDP, no API response mocks.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, mkdtemp, rm, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const backend = fileURLToPath(new URL('../../backend/', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'tackbar-backend-ui-'))
const profile = await mkdtemp(join(tmpdir(), 'tackbar-browser-ui-'))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let backendLogs = '', browser, socket, closeBrowser
const python = spawn(process.env.TACKBAR_TEST_PYTHON || 'python', ['tests/admin_upload_browser_runtime.py'], {
  cwd: backend, env: { ...process.env, TACKBAR_DATA_DIR: root }, windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
python.stdout.on('data', (data) => { backendLogs += data })
python.stderr.on('data', (data) => { backendLogs += data })
try {
  let manifest
  for (let attempt = 0; attempt < 200; attempt++) {
    if (python.exitCode !== null) throw new Error(backendLogs)
    try { manifest = JSON.parse(await readFile(join(root, 'browser-runtime.json'), 'utf8')); break } catch { await delay(100) }
  }
  assert.ok(manifest, `Backend startup: ${backendLogs}`)
  const origin = `http://127.0.0.1:${manifest.port}`
  const api = async (path) => {
    const response = await fetch(origin + path, { headers: { 'X-TackBar-Admin-Key': 'offline-browser-admin' } })
    assert.ok(response.ok, `${path}: ${response.status}`)
    return response.json()
  }
  for (let attempt = 0; attempt < 100; attempt++) { try { await api('/health'); break } catch { await delay(100) } }
  const browserPath = process.env.TACKBAR_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let port
  for (let attempt = 0; attempt < 100; attempt++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) } }
  assert.ok(port, 'Chromium debugging started')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map(), requests = []
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) { const entry = pending.get(message.id); pending.delete(message.id); message.error ? entry.reject(message.error) : entry.resolve(message.result) }
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.startsWith(origin + '/api/')) requests.push(message.params.request.url)
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params
      const local = request.url.startsWith(origin + '/') || /^(data|blob):/.test(request.url)
      void send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(!local ? { errorReason: 'BlockedByClient' } : {}) })
    }
  }
  closeBrowser = () => send('Browser.close')
  await send('Network.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 200; attempt++) { if (await evaluate(expression)) return; await delay(100) }
    throw new Error(`Timed out: ${expression}; backend: ${backendLogs.slice(-2000)}`)
  }
  const click = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`)
  const login = async () => {
    await waitFor(`!!document.querySelector('#admin-key')`)
    await evaluate(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.querySelector('#admin-key'),'offline-browser-admin'); document.querySelector('#admin-key').dispatchEvent(new Event('input',{bubbles:true}))`)
    await click('Enter Admin'); await waitFor(`!!document.querySelector('.admin-tabs')`)
  }
  const chooseFile = async (path) => {
    if (!await evaluate(`!!document.querySelector('.admin-upload')`)) await click('Upload track')
    await waitFor(`!!document.querySelector('.admin-upload input')`)
    await evaluate(`{const s=document.querySelector('.admin-upload select');s.value=${JSON.stringify(manifest.sailor_id)};s.dispatchEvent(new Event('change',{bubbles:true}))}`)
    const document = await send('DOM.getDocument')
    const input = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '.admin-upload input' })
    await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path] })
    await evaluate(`document.querySelector('.admin-upload').requestSubmit()`)
  }
  const waitProcessed = (filename) => waitFor(`document.querySelector('.admin-upload-result')?.textContent.includes(${JSON.stringify(filename)}) && document.querySelector('.admin-upload-result')?.textContent.includes('Processed')`)
  const inspect = async () => {
    await evaluate(`document.querySelector('.admin-upload-result .admin-relation').click()`)
    await waitFor(`!!document.querySelector('.admin-ingestion-detail') && !document.querySelector('.admin-header button').disabled`)
  }
  await send('Page.navigate', { url: origin + '/admin' }); await login()
  await click('Upload track')
  assert.deepEqual(await evaluate(`Array.from(document.querySelector('.admin-upload select').options).map(o=>o.value)`), ['', manifest.sailor_id])
  await chooseFile(manifest.files[0])
  await waitFor(`document.querySelector('.admin-upload-result')?.textContent.includes('Pending')`)
  await click('Sailors')
  const readsAway = requests.filter((url) => url.includes('/api/admin/ingestions')).length
  await unlink(join(root, 'pause_pending'))
  await delay(2300)
  assert.equal(requests.filter((url) => url.includes('/api/admin/ingestions')).length, readsAway, 'No ingestion polling in Sailors')
  await click('Ingestions')
  await waitFor(`document.querySelector('.admin-upload-result')?.textContent.includes('Processing')`)
  await inspect()
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.admin-ingestion-detail button')).find(b=>b.textContent==='Reprocess').disabled`))
  await unlink(join(root, 'pause_processing'))
  await waitProcessed(basename(manifest.files[0]))
  console.log('PASS: actual backend Pending -> navigation away -> Processing -> Processed; active-only selector and disabled maintenance')

  const uploaded = []
  for (const [index, path] of manifest.files.entries()) {
    if (index) { await click('Ingestions'); await chooseFile(path); await waitProcessed(basename(path)) }
    await inspect()
    const records = await api('/api/admin/ingestions')
    const record = records.find((item) => item.attachment_name === basename(path))
    assert.equal(record.status, 'processed')
    assert.equal(record.sailor_id, manifest.sailor_id)
    assert.equal(record.provider_message_id, null)
    uploaded.push(record)
    await evaluate(`Array.from(document.querySelectorAll('.admin-ingestion-detail .admin-relation')).find(b=>b.textContent.startsWith('Activity')).click()`)
    await waitFor(`!!document.querySelector('.admin-activity-card.is-expanded')`)
    const activity = await api(`/api/admin/activities/${record.activity_id}`)
    assert.equal(activity.boat.id, manifest.boat_id)
    await evaluate(`Array.from(document.querySelectorAll('.admin-activity-detail .admin-relation')).find(b=>b.textContent.startsWith('Session')).click()`)
    await waitFor(`!!document.querySelector('.admin-session-card.is-expanded')`)
    console.log(`PASS: real HTTP/UI ${basename(path)} -> Ingestion -> Activity -> Session (${activity.sample_count} samples)`)
  }
  await click('Ingestions'); await chooseFile(manifest.files[0]); await waitProcessed(basename(manifest.files[0]))
  let records = await api('/api/admin/ingestions')
  const repeats = records.filter((item) => item.attachment_name === basename(manifest.files[0]))
  assert.equal(repeats.length, 2); assert.equal(repeats[0].activity_id, repeats[1].activity_id)
  assert.ok(repeats.some((item) => item.activity_created_by_ingestion === false))
  await chooseFile(join(root, 'invalid.gpx'))
  await waitFor(`document.querySelector('.admin-upload-result')?.textContent.includes('invalid.gpx') && document.querySelector('.admin-upload-result')?.textContent.includes('Failed')`)
  await inspect()
  await evaluate(`window.confirm=()=>true`); await click('Reprocess')
  await waitFor(`!document.querySelector('.admin-header button').disabled && document.querySelector('.admin-ingestion-detail')?.textContent.includes('Manual track processing failed')`)
  records = await api('/api/admin/ingestions')
  assert.equal(records.find((item) => item.attachment_name === 'invalid.gpx').attempts, 2)
  const stoppedReads = requests.filter((url) => url.includes('/api/admin/ingestions')).length
  await delay(2300)
  assert.equal(requests.filter((url) => url.includes('/api/admin/ingestions')).length, stoppedReads, 'No terminal polling')
  assert.ok(records.every((item) => item.provider === 'admin_upload'))
  assert.equal((await api('/api/admin/activities')).length, 6)
  assert.equal(records.length, 8)
  await assert.rejects(readFile(join(root, 'deliveries.jsonl')), { code: 'ENOENT' })
  console.log('PASS: repeat upload reuses Activity; invalid original remains failed, explicit Reprocess increments attempts; manual operations send no mail')

  await send('Page.reload')
  await login()
  assert.equal(await evaluate(`document.querySelectorAll('.admin-ingestion-card').length`), 8)
  const session = await api(`/api/admin/sessions/${uploaded[0].session_id}`)
  assert.ok(session.capability_path)
  await send('Page.navigate', { url: origin + session.capability_path })
  await waitFor(`!!document.querySelector('.viewer-page') && !!document.querySelector('select[aria-label="My track"]')`)
  await waitFor(`!document.querySelector('.track-unavailable')`)
  assert.ok(requests.some((url) => url.includes('/api/shared/sessions/') && url.endsWith('/track')))
  console.log('PASS: full browser reload inspects persisted results; actual Session Viewer and track APIs load (external basemap requests blocked)')
} finally {
  // Release timing gates even after a failing assertion so the worker can exit.
  await Promise.allSettled(['pause_pending', 'pause_processing'].map((name) => unlink(join(root, name))))
  if (closeBrowser) await Promise.race([closeBrowser().catch(() => {}), delay(1000)])
  if (socket?.readyState === WebSocket.OPEN) socket.close()
  browser?.kill()
  python.kill()
  await Promise.race([new Promise((resolve) => python.once('exit', resolve)), delay(3000)])
  for (const [directory, prefix] of [[root, 'tackbar-backend-ui-'], [profile, 'tackbar-browser-ui-']]) {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith(prefix))
    await rm(directory, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
  }
}
