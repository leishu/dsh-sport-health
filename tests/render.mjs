/**
 * Smoke test for every registered tool card.
 *
 * Loads the built client bundle the same way the Harness shell does, mounts
 * each slot host into jsdom and feeds it a captured MCP tool result, then
 * fails loudly on Vue warnings, console errors or an empty DOM.
 *
 *   npm run build && node tests/render.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ── browser environment ───────────────────────────────────────────────── */

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://127.0.0.1/preview/',
  pretendToBeVisual: true,
})
const { window } = dom

// ECharts needs a canvas context; jsdom has none, so measurements are stubbed.
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  return {
    measureText: () => ({ width: 10 }),
    fillText() {}, strokeText() {}, save() {}, restore() {}, scale() {}, translate() {},
    clearRect() {}, fillRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, drawImage() {}, setTransform() {},
    getImageData: () => ({ data: [] }),
    createLinearGradient: () => ({ addColorStop() {} }),
    setLineDash() {}, bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, clip() {},
  }
}
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 180, width: 320, height: 180,
})
window.ResizeObserver = class ResizeObserver {
  observe() {} unobserve() {} disconnect() {}
}

globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.Element = window.Element
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0)
globalThis.cancelAnimationFrame = handle => clearTimeout(handle)
globalThis.ResizeObserver = window.ResizeObserver
for (const name of [
  'SVGElement', 'Element', 'HTMLDivElement', 'HTMLInputElement', 'HTMLStyleElement',
  'HTMLCanvasElement', 'DocumentFragment', 'MutationObserver', 'MediaQueryList',
  'MouseEvent', 'CustomEvent', 'Event', 'Node',
]) {
  if (window[name]) globalThis[name] = window[name]
}

const warnings = []
const errors = []
const originalWarn = console.warn
const originalError = console.error
console.warn = (...args) => { warnings.push(args.join(' ')); originalWarn(...args) }
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args) }

/* ── load the bundle exactly like the shell ────────────────────────────── */

let registration
window.__ModuleLoader__ = { load: value => { registration = value } }
window.eval(readFileSync(join(root, 'lib/client.js'), 'utf8'))
if (!registration) throw new Error('client bundle did not register with window.__ModuleLoader__')

const out = registration.factory(specifier => {
  throw new Error(`bundled client should not require(${specifier}) at runtime`)
})

const toolviews = new Map()
let dashboard
const ctx = {
  slots: {
    inject(_name, callback) {
      const result = callback()
      if (result && typeof result[Symbol.iterator] === 'function') for (const disposer of result) void disposer
    },
    register(options, component) {
      if (options.name === 'tool.call.toolview') toolviews.set(options.key, component)
      if (options.name === 'conversation.view') dashboard = component
      return () => {}
    },
  },
  logger: { info() {}, warn() {} },
}
out.apply(ctx)

if (toolviews.size !== 20) throw new Error(`expected 20 toolviews, got ${toolviews.size}`)
if (typeof dashboard !== 'function') throw new Error('dashboard view was not registered')

/* ── stylesheet injection ──────────────────────────────────────────────── */

// The shell only fetches a bundle's JS entry, so the plugin must inject its
// own stylesheet at load time instead of shipping a sibling `client.css`.
const styleTags = [...window.document.head.querySelectorAll('style[data-plugin-css]')]
if (styleTags.length !== 1) {
  throw new Error(`expected exactly 1 injected stylesheet, found ${styleTags.length}`)
}
const injected = styleTags[0]
if (injected.getAttribute('data-plugin-css') !== 'dsh-sport-health') {
  throw new Error(`unexpected stylesheet tag id: ${injected.getAttribute('data-plugin-css')}`)
}
const sheet = injected.textContent
// Probes come from the *bundled* stylesheet (Element Plus + SFC styles), not
// from `overlayFixes()`, which `ensureThemeVars()` injects at first render.
for (const probe of ['.sh-card--tool', '--el-color-primary', '.el-table__empty-block']) {
  if (!sheet.includes(probe)) throw new Error(`injected stylesheet is missing ${probe}`)
}
if (sheet.length < 50000) throw new Error(`injected stylesheet looks truncated: ${sheet.length} chars`)
console.log('ok   stylesheet injection'.padEnd(26), `${Math.round(sheet.length / 1024)} kB inline`)

// Re-evaluating the module must not add a second copy.
window.eval(readFileSync(join(root, 'lib/client.js'), 'utf8'))
if (window.document.head.querySelectorAll('style[data-plugin-css]').length !== 1) {
  throw new Error('stylesheet injection is not idempotent')
}
console.log('ok   stylesheet injection is idempotent')

const flush = () => new Promise(resolve => setTimeout(resolve, 80))

let failures = 0
const check = async (label, fn) => {
  try {
    await fn()
    console.log(`ok   ${label}`)
  } catch (error) {
    failures += 1
    originalError(`FAIL ${label}:`, error?.message ?? error)
  }
}

function mountTool(toolName, block, phase = 'result') {
  const host = toolviews.get(toolName)
  if (!host) throw new Error(`no toolview registered for ${toolName}`)
  const instance = host()
  const element = instance.render()
  instance.setProps({ toolName, phase, block })
  return { instance, element }
}

const fixtures = readdirSync(join(root, 'tests/fixtures')).filter(file => file.startsWith('sport-'))

for (const file of fixtures) {
  const raw = file.replace(/^sport-/, '').replace(/\.json$/, '')
  const payload = JSON.parse(readFileSync(join(root, 'tests/fixtures', file), 'utf8'))
  await check(raw.padEnd(24), async () => {
    const { instance, element } = mountTool(`mcp__sport_health__${raw}`, {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      isError: false,
    })
    await flush()
    const html = element?.innerHTML ?? ''
    if (html.length < 100) throw new Error(`suspiciously short output (${html.length} chars)`)
    instance.destroy()
  })
}

await check('pending state', async () => {
  const { instance, element } = mountTool('mcp__sport_health__list_runs', {}, 'start')
  await flush()
  if (!element?.innerHTML.includes('调用中')) throw new Error('pending badge missing')
  instance.destroy()
})

await check('error state', async () => {
  const { instance, element } = mountTool('mcp__sport_health__list_runs', {
    content: [{ type: 'text', text: 'server exploded' }],
    isError: true,
  })
  await flush()
  const html = element?.innerHTML ?? ''
  if (!html.includes('失败') || !html.includes('server exploded')) throw new Error('error state missing')
  instance.destroy()
})

/** The dashboard fetches its snapshot; serve the captured overview fixture. */
const overview = JSON.parse(readFileSync(join(root, 'tests/fixtures/api-overview.json'), 'utf8'))
window.fetch = async () => new Response(JSON.stringify(overview), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})
globalThis.fetch = window.fetch

await check('dashboard', async () => {
  const instance = dashboard()
  const element = instance.render()
  await flush()
  const html = element?.innerHTML ?? ''
  if (html.length < 500) throw new Error(`dashboard rendered too little (${html.length} chars)`)
  if (!html.includes('运动健康')) throw new Error('dashboard header missing')
  instance.destroy()
})

const relevantWarnings = warnings.filter(message => message.includes('[Vue warn]'))
if (relevantWarnings.length > 0) {
  failures += 1
  originalError(`FAIL ${relevantWarnings.length} Vue warning(s):`)
  for (const message of relevantWarnings.slice(0, 10)) originalError(`  ${message}`)
}
if (errors.length > 0) {
  failures += 1
  originalError(`FAIL ${errors.length} console error(s):`)
  for (const message of errors.slice(0, 10)) originalError(`  ${message}`)
}

if (failures > 0) {
  originalError(`\n${failures} render check(s) failed`)
  process.exit(1)
}
console.log('\nall render checks passed')
