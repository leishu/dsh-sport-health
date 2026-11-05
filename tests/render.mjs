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

/* ── React 桥接测试替身 ─────────────────────────────────────────────────── */

/**
 * 最小 React 运行时，契约与 shell 一致。
 *
 * renderer 是按 `jsx(Comp, props)` 挂载 slot 条目的 —— 组件必须**返回 React
 * 元素**。只按旧方式 `instance.render()` 调用会绕过这条路径，正是它让
 * 「返回 DOM 节点」的适配器一路绿灯却把看板渲染成白屏。
 * 这里按 React 的方式派发，路径与运行时一致。
 */
let pendingEffects = null

const reactShim = {
  createElement(type, props, ...children) {
    return { type, props: { ...props, children } }
  },
  useRef(initial) { return { current: initial } },
  useEffect(effect) { (pendingEffects ?? []).push(effect) },
}

/* ── load the bundle exactly like the shell ────────────────────────────── */

/**
 * 真实加载是两阶段的，这里必须照抄，否则测出来的成功是假的：
 *
 *   1. `<script>` 求值 —— 只调 `__ModuleLoader__.load()` 注册 factory，
 *      模块体一行都不跑（CSS 注入也在这之后）；
 *   2. 第一次 import 时 shell 调 `factory(require)` —— 模块体全部在这里执行，
 *      `apply` 也在这一步被定义。插件要拿宿主 React，只能在这个同步窗口里
 *      通过 factory 的 `require` 拿（`apply(ctx)` 时 `ctx.require` 并不存在）。
 */
let registration
window.__ModuleLoader__ = { load: value => { registration = value } }
window.eval(readFileSync(join(root, 'lib/client.js'), 'utf8'))
if (!registration) throw new Error('client bundle did not register with window.__ModuleLoader__')

const requireLog = []
const out = registration.factory(specifier => {
  requireLog.push(specifier)
  if (specifier === 'react') return reactShim
  throw new Error(`client require("${specifier}") missed the module table`)
})

// 物化阶段已经在模块顶层（`captureShellReact()`）取过 React。
// 少走这一步 → 插件能加载、能注册，但一渲染就抛「no React runtime」，
// shell 只会报 `web boot: 1 entry did not activate`，看不出根因。
if (!requireLog.includes('react')) {
  throw new Error(`bundle never required("react") during materialization (saw: ${requireLog.join(', ') || 'nothing'})`)
}
console.log('ok   react resolved through factory')

const toolviews = new Map()
let dashboard
// ctx 只带 inject 进来的服务 —— 与 shell 完全一致，故意不给 require。
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

// Re-evaluating the module must not add a second copy. (Same two-phase load;
// the second pass is a *different* factory instance, so it captures React from
// its own require — the exact path a plugin reload takes.)
const before = window.document.head.querySelectorAll('style[data-plugin-css]').length
let second
window.__ModuleLoader__ = { load: value => { second = value } }
window.eval(readFileSync(join(root, 'lib/client.js'), 'utf8'))
second.factory(specifier => {
  if (specifier === 'react') return reactShim
  throw new Error(`second load: unexpected require(${specifier})`)
})
if (window.document.head.querySelectorAll('style[data-plugin-css]').length !== before) {
  throw new Error('stylesheet injection is not idempotent')
}
window.__ModuleLoader__ = { load: () => {} }
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
  const cell = window.document.createElement('div')
  const view = renderReact(host, { toolName, phase, block })
  cell.appendChild(view.element)
  return { instance: { destroy: view.destroy }, element: cell }
}

/**
 * 按渲染器的方式挂载一个 slot 条目：调用组件拿到 React 元素，物化进 DOM，
 * 随后执行 `useEffect`（React 在提交阶段做这事）。
 */
function renderReact(Comp, props) {
  pendingEffects = []
  const tree = reactShim.createElement(Comp, props)
  const host = window.document.createElement('div')
  if (typeof tree.type === 'function') {
    placeElement(tree.type(tree.props ?? {}), host)
  } else {
    placeElement(tree, host)
  }
  const cleanups = []
  const effects = pendingEffects
  pendingEffects = null
  for (const effect of effects) {
    const cleanup = effect()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  }
  return { element: host, destroy() { for (const cleanup of cleanups.splice(0)) cleanup() } }
}

/** 把 React 元素树物化成真实 DOM。字符串类型是宿主标签，函数类型就地派发。 */
function placeElement(element, parent) {
  if (element === null || element === undefined) return null
  if (typeof element === 'string' || typeof element === 'number') {
    const text = window.document.createTextNode(String(element))
    parent.appendChild(text)
    return text
  }
  if (typeof element.type === 'function') return placeElement(element.type(element.props ?? {}), parent)

  const node = window.document.createElement(element.type)
  const props = element.props ?? {}
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || value === undefined) continue
    if (key === 'ref') { value.current = node; continue }
    if (key === 'className') node.className = value
    else if (key === 'style' && value && typeof value === 'object') Object.assign(node.style, value)
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value)
    else node.setAttribute(key, String(value))
  }
  for (const child of props.children ?? []) placeElement(child, node)
  parent.appendChild(node)
  return node
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
const serveOverview = payload => {
  const fetchImpl = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  window.fetch = fetchImpl
  globalThis.fetch = fetchImpl
}
serveOverview(overview)

await check('dashboard', async () => {
  const view = renderReact(dashboard, { inspectCall() {}, openView() {}, viewRequest: undefined })
  await flush()
  const html = view.element.innerHTML
  if (html.length < 500) throw new Error(`dashboard rendered too little (${html.length} chars)`)
  if (!html.includes('运动健康')) throw new Error('dashboard header missing')
  view.destroy()
})

await check('dashboard renders trend, race predictions and weather', async () => {
  // 三个面板都来自 overview 的新 section。断言「标题 + 真实数值」而不是只断言
  // 标题，否则数据没接上时面板会空着嘴通过。
  const view = renderReact(dashboard, {})
  await flush()
  const html = view.element.innerHTML

  if (!html.includes('周跑量趋势')) throw new Error('trend panel title missing')
  // 夹具里最后一个完整周是 10-26 ~ 11-01，22.89 km。
  if (!html.includes('22.9')) throw new Error('trend panel did not render the last complete week')
  if (!html.includes('本周进行中')) throw new Error('ongoing-week note missing — partial week must be called out')

  if (!html.includes('比赛成绩预测')) throw new Error('race prediction panel title missing')
  for (const label of ['5K', '10K', '半马', '全马']) {
    if (!html.includes(label)) throw new Error(`race prediction missing ${label}`)
  }
  if (!html.includes('置信度 高')) throw new Error('prediction confidence missing')

  if (!html.includes('天气对配速的影响')) throw new Error('weather panel title missing')
  if (!html.includes('秒/km')) throw new Error('weather panel did not render pace deltas')

  view.destroy()
})

/**
 * 回归护栏：聚合体里少了某个数据段时，面板必须**说出原因**。
 *
 * 真实故障就长这样 —— client bundle 随 `web boot` 更新了，host 模块还停在
 * 旧进程里，于是新面板出现、聚合体没有对应键。只显示「暂无数据」的话，
 * 看起来和「渲染挂了」一模一样，只能靠猜。
 */
await check('missing dashboard sections explain themselves', async () => {
  const stale = { ...overview }
  delete stale.trend
  delete stale.predictions
  serveOverview(stale)
  try {
    const view = renderReact(dashboard, {})
    await flush()
    const html = view.element.innerHTML
    if (!html.includes('周跑量趋势数据未返回')) throw new Error('trend panel should name the missing section')
    if (!html.includes('比赛成绩预测数据未返回')) throw new Error('race panel should name the missing section')
    // 空态必须把实际收到的 section 打出来，否则「旧 host」和「真的没数据」无法区分。
    if (!html.includes('本次响应包含 summary')) throw new Error('missing-section note should list the sections that did arrive')
    if (html.includes('本次响应包含 trend')) throw new Error('the note must not claim a section that is absent')
    if (!html.includes('完整退出 DSH')) throw new Error('missing-section note must say how to restart the host process')
    view.destroy()
  } finally {
    serveOverview(overview)
  }
})

await check('slot entries are React components', async () => {
  // 回归护栏：渲染器按 `jsx(Comp, props)` 挂载，组件必须**返回 React 元素**。
  // 早期适配器返回 DOM 节点，React 抛 error #31，整个 conversation.view 崩成空白。
  for (const [key, Comp] of toolviews) {
    const element = Comp({ toolName: key, phase: 'start' })
    if (element === null || typeof element !== 'object' || typeof element.type !== 'string') {
      throw new Error(`${key}: slot component must return a React element`)
    }
  }
  const element = dashboard({})
  if (element === null || typeof element !== 'object' || element.type !== 'div') {
    throw new Error('dashboard slot component must return a div element')
  }
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
