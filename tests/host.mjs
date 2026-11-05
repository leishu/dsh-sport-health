/**
 * End-to-end test of the host half against a local mock MCP server.
 *
 * The mock speaks just enough Streamable HTTP to exercise session setup,
 * tool discovery, tool calls, session recovery, and the read-only dashboard
 * routes. Run after `npm run build` (part of `npm test`).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Tool name -> recorded MCP payload. */
const fixtures = new Map()
for (const file of readdirSync(join(root, 'tests/fixtures'))) {
  const match = /^sport-(.+)\.json$/.exec(file)
  if (match) fixtures.set(match[1], JSON.parse(readFileSync(join(root, 'tests/fixtures', file), 'utf8')))
}
assert.equal(fixtures.size, 20, 'expected 20 tool fixtures')

const calls = []
let sessionCounter = 0
let expireNextCall = false

const server = createServer(async (request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405).end()
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))

  const reply = (body, status = 200, extraHeaders = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...extraHeaders })
    response.end(JSON.stringify(body))
  }

  if (message.method === 'initialize') {
    sessionCounter += 1
    reply({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'mock-sport-health', version: '1.0.0' },
      },
    }, 200, { 'mcp-session-id': `session-${sessionCounter}` })
    return
  }

  if (message.method === 'notifications/initialized') {
    response.writeHead(202).end()
    return
  }

  if (message.method === 'tools/list') {
    reply({
      jsonrpc: '2.0',
      id: message.id,
      result: { tools: Array.from(fixtures.keys(), name => ({ name, description: name })) },
    })
    return
  }

  if (message.method === 'tools/call') {
    if (expireNextCall) {
      expireNextCall = false
      reply({ jsonrpc: '2.0', id: message.id, error: { code: -32001, message: 'session expired' } }, 404)
      return
    }
    const name = message.params?.name
    const payload = fixtures.get(name)
    if (!payload) {
      reply({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'unknown tool' }], isError: true } })
      return
    }
    calls.push({ name, args: message.params?.arguments ?? {} })
    reply({
      jsonrpc: '2.0',
      id: message.id,
      result: { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false },
    })
    return
  }

  reply({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `unknown method ${message.method}` } })
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/mcp`

const routes = new Map()
apply({
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  },
  effect(execute) { execute() },
  logger: { info() {}, warn() {}, error() {} },
}, { url, timeoutMs: 5_000, cacheTtlMs: 0 })

const handler = routes.get('/sport-health/api')?.handler
assert.equal(typeof handler, 'function', 'host route was not registered')

async function get(path) {
  const chunks = []
  const request = { method: 'GET', url: path, headers: {} }
  const response = {
    headersSent: false,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
      this.headersSent = true
    },
    end(body) { if (body) chunks.push(body) },
  }
  await handler(request, response)
  const text = chunks.join('')
  return { status: response.status, body: JSON.parse(text) }
}

let failures = 0
async function check(label, fn) {
  try {
    await fn()
    console.log(`ok   ${label}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${label}:`, error)
  }
}

await check('index lists the dashboard endpoints', async () => {
  const { status, body } = await get('/sport-health/api')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.service, 'dsh-sport-health')
  assert.deepEqual(body.endpoints.length, 4)
})

await check('health reports all 20 MCP tools', async () => {
  const { status, body } = await get('/sport-health/api/health')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.toolCount, 20)
  assert.ok(body.tools.includes('get_running_summary'))
})

await check('overview assembles every dashboard section', async () => {
  const { status, body } = await get('/sport-health/api/overview')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.deepEqual(body.errors, [])
  assert.equal(body.summary.summary.runCount, 6)
  assert.ok(body.daily.groups.length > 0)
  assert.ok(body.mix.types.length > 0)
  assert.equal(body.load.riskLevel, 'HIGH_RISK')
  assert.ok(Array.isArray(body.runs.runs))
})

await check('overview carries the weekly trend and race predictions', async () => {
  // 这两个 section 是后来加的：early return 之类的回归不该让它们悄悄消失，
  // 否则前端只会渲染出空面板，而 `ok` 依然是 true。
  const { body } = await get('/sport-health/api/overview')
  assert.ok(body.trend, 'trend section missing')
  assert.ok(Array.isArray(body.trend.periods), 'trend.periods must be an array')
  assert.ok(body.predictions, 'predictions section missing')
  assert.ok(Array.isArray(body.predictions.predictions), 'predictions.predictions must be an array')
  assert.ok(body.predictions.predictions.length > 0, 'predictions must not be empty')
  // 天气是 dashboard 的第三个新面板，同样别让它退回「拉了但没用」。
  assert.ok(body.weather, 'weather section missing')
  assert.ok(Array.isArray(body.weather.temperatureBuckets), 'weather.temperatureBuckets must be an array')
})

await check('overview asks the trend for weekly buckets', async () => {
  await get('/sport-health/api/overview')
  const trendCall = calls.filter(call => call.name === 'get_training_trend').at(-1)
  assert.deepEqual(trendCall?.args, { period: 'week', count: 8 })
})

await check('runs forwards paging and sorting arguments', async () => {
  calls.length = 0
  const { status, body } = await get('/sport-health/api/runs?limit=3&offset=2&sortBy=distance')
  assert.equal(status, 200)
  assert.ok(Array.isArray(body.runs))
  assert.deepEqual(calls.at(-1), {
    name: 'list_runs',
    args: { limit: 3, offset: 2, sortBy: 'distance' },
  })
})

await check('run bundles detail, splits, route, elevation, stops and classification', async () => {
  calls.length = 0
  const runId = '20261101户外跑步'
  const { status, body } = await get(`/sport-health/api/run?id=${encodeURIComponent(runId)}`)
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.runId, runId)
  assert.ok(body.detail)
  assert.ok(body.splits)
  assert.ok(body.route)
  assert.ok(body.elevation)
  assert.ok(body.classification)
  assert.equal(calls.length, 6)
  assert.ok(calls.every(call => call.args.runId === runId))
})

await check('unknown paths return 404', async () => {
  const { status, body } = await get('/sport-health/api/nope')
  assert.equal(status, 404)
  assert.equal(body.ok, false)
})

await check('run without an id returns 400', async () => {
  const { status, body } = await get('/sport-health/api/run')
  assert.equal(status, 400)
  assert.equal(body.ok, false)
})

await check('non-GET requests return 405', async () => {
  const chunks = []
  const request = { method: 'POST', url: '/sport-health/api/overview', headers: {} }
  const response = {
    headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end(body) { if (body) chunks.push(body) },
  }
  await handler(request, response)
  assert.equal(response.status, 405)
  assert.equal(JSON.parse(chunks.join('')).ok, false)
})

await check('an expired MCP session is re-initialized and replayed', async () => {
  expireNextCall = true
  const before = sessionCounter
  const { status, body } = await get('/sport-health/api/overview')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.ok(sessionCounter > before, 'client did not re-initialize after session expiry')
})

server.close()
if (failures > 0) {
  console.error(`\n${failures} host check(s) failed`)
  process.exit(1)
}
console.log('\nall host checks passed')
