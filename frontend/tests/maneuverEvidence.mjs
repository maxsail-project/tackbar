// Run after `npm run build`: node tests/maneuverEvidence.mjs
// Uses an installed Chromium browser (TACKBAR_TEST_BROWSER overrides Edge),
// native CDP and synthetic API fixtures. External networking is blocked.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { preview } from 'vite'

const profile = await mkdtemp(join(tmpdir(), 'tackbar-evidence-browser-'))
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } })
const origin = server.resolvedUrls.local[0].replace(/\/$/, '')
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
let browser, socket, closeBrowser
try {
  const browserPath = process.env.TACKBAR_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let port
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) }
  }
  assert.ok(port, 'Chromium debugging started')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject })
  let sequence = 0
  const pending = new Map()
  const send = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence
    pending.set(id, { done, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      message.error ? entry.reject(message.error) : entry.done(message.result)
    }
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params
      const local = request.url.startsWith(origin + '/') || /^(data|blob):/.test(request.url)
      void send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(!local ? { errorReason: 'BlockedByClient' } : {}) })
    }
  }
  closeBrowser = () => send('Browser.close')
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(`!!(${expression})`)) return; await delay(100) }
    throw new Error(`Timed out: ${expression}`)
  }
  const key = async (key, code, virtual, text) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtual, ...(text ? { text, unmodifiedText: text } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtual })
  }
  const help = `document.querySelector('.maneuver-evidence__help')`
  const info = `document.querySelector('.maneuver-evidence__info')`
  const open = `${help}?.matches(':popover-open')`
  const setSelection = (label, value) => evaluate(`(() => {
    const el = document.querySelector('select[aria-label="${label}"]')
    el.value = '${value}'; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: String.raw`
    const start = '2031-01-01T10:00:00Z', end = '2031-01-01T10:02:00Z'
    const activities = ['high', 'low', 'unavailable'].map(id => ({ id, source: 'test', device_name: 'test', original_filename: id + '.gpx', start_time: start, end_time: end, sample_count: 121, sailor: { id, name: id, email: id + '@example.test' }, boat: null }))
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input, options) => {
      const url = String(input)
      if (!url.startsWith('/api/')) return nativeFetch(input, options)
      const id = url.match(/activities\/([^/]+)/)?.[1]
      let body
      if (url.endsWith('/track')) body = { activity_id: id, samples: Array.from({ length: 121 }, (_, i) => ({ utc: new Date(Date.parse(start) + i * 1000).toISOString(), lat: 40 + i * .00001, lon: 3, dist: 2, sog: 4, cog: 90, hdg: id === 'high' ? 90 : null, heel: null, trim: null })) }
      else if (url.endsWith('/maneuvers')) body = { activity_id: id, status: id === 'unavailable' ? 'unavailable' : 'available', detector_mode: id === 'high' ? 'HIGH' : id === 'low' ? 'LOW' : null, signal_basis: id === 'high' ? ['hdg'] : id === 'low' ? ['cog', 'sog'] : [], maneuvers: [] }
      else if (url.endsWith('/temporary-share')) body = { path: '/q/test', expires_at: '2032-01-01T00:00:00Z' }
      else body = { start_time: start, end_time: end, activities, location_label: null, location_country: null, historical_conditions: null, session_access_expires_at: '2032-01-01T00:00:00Z', temporary_access_expires_at: '2032-01-01T00:00:00Z' }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  ` })
  for (const route of ['s', 'q']) {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })
    await send('Page.navigate', { url: `${origin}/${route}/test` })
    await waitFor(`document.querySelector('.maneuver-section__collapse')`)
    await setSelection('Compare', 'low')
    await waitFor(`document.querySelector('.maneuver-evidence')?.textContent.includes('C · LOW evidence')`)
    await setSelection('My track', 'low')
    await setSelection('Compare', 'high')
    await waitFor(`document.querySelector('.maneuver-evidence')?.textContent.includes('P · LOW evidence') && document.querySelector('.maneuver-evidence')?.textContent.includes('C · HIGH evidence')`)
    await setSelection('Compare', 'unavailable')
    await waitFor(`document.querySelector('.maneuver-statuses')?.textContent.includes('unavailable for C')`)
    assert.equal(await evaluate(`document.querySelector('.maneuver-evidence').textContent.includes('C ·')`), false)
    await setSelection('Compare', '')
    await waitFor(`document.querySelector('.maneuver-empty')`)
    await setSelection('Compare', 'high')
    await waitFor(`document.querySelector('.maneuver-evidence')?.textContent.includes('C · HIGH evidence')`)
    await evaluate(`document.querySelector('.maneuver-section__collapse').click()`)
    await waitFor(`document.querySelector('.maneuver-section__collapse').getAttribute('aria-expanded') === 'true'`)
    await evaluate(`document.querySelector('.maneuver-section__collapse').focus()`)
    await key('Tab', 'Tab', 9)
    assert.equal(await evaluate(`document.activeElement === ${info}`), true)
    assert.equal(await evaluate(`${info}.matches(':focus-visible') && getComputedStyle(${info}).outlineStyle !== 'none'`), true)
    await key('Enter', 'Enter', 13, '\r')
    await waitFor(open)
    await key('Escape', 'Escape', 27)
    await waitFor(`!(${open}) && ${info}.getAttribute('aria-expanded') === 'false'`)
    assert.equal(await evaluate(`document.activeElement === ${info}`), true)
    await key(' ', 'Space', 32, ' ')
    await waitFor(open)
    await key(' ', 'Space', 32, ' ')
    await waitFor(`!(${open})`)
    await send('Emulation.setTouchEmulationEnabled', { enabled: true })
    const point = await evaluate(`(() => { const el = ${info}; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await waitFor(open)
    assert.equal(await evaluate(`${help}.querySelector('h3').textContent`), 'Maneuver detection evidence')
    for (const width of [320, 375, 768]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 740, deviceScaleFactor: 1, mobile: width < 768 })
      await evaluate(`document.querySelector('.maneuver-section').scrollIntoView({ block: 'start' })`)
      const layout = await evaluate(`(() => {
        const panel = ${help}, r = panel.getBoundingClientRect(), button = ${info}, b = button.getBoundingClientRect(), style = getComputedStyle(button)
        return { fits: r.left >= 0 && r.right <= innerWidth && r.width > 200 && panel.scrollWidth <= panel.clientWidth + 1, touch: b.width >= 44 && b.height >= 44, subtle: style.borderTopWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)' }
      })()`)
      assert.deepEqual(layout, { fits: true, touch: true, subtle: true }, `${route} ${width}px`)
      if (process.env.TACKBAR_TEST_SCREENSHOTS) {
        await mkdir(process.env.TACKBAR_TEST_SCREENSHOTS, { recursive: true })
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile(join(process.env.TACKBAR_TEST_SCREENSHOTS, `${route}-${width}.png`), Buffer.from(shot.data, 'base64'))
      }
    }
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 2, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 2, button: 'left', clickCount: 1 })
    await waitFor(`!(${open})`)
    await evaluate(`${info}.click()`)
    await waitFor(open)
    await evaluate(`document.querySelector('.maneuver-section__collapse').click()`)
    await waitFor(`!(${open})`)
    console.log(`PASS /${route}/: selection, zero/unavailable, Tab/focus, Enter/Space, Escape, touch, outside/collapse dismissal, 320/375/768px`)
  }
} finally {
  if (closeBrowser) await Promise.race([closeBrowser().catch(() => {}), delay(1000)])
  socket?.close()
  browser?.kill()
  await new Promise((done) => server.httpServer.close(done))
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
  assert.ok(basename(profile).startsWith('tackbar-evidence-browser-'))
  await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}
