/**
 * Host half of dsh-sport-health.
 *
 * Registers a small read-only JSON API under `/sport-health/api` on the DSH
 * web server. The client-side chart toolviews do not need this proxy, but the
 * standalone "运动健康" conversation view does: it renders from cacheable
 * snapshots instead of invoking model tools.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSportHealthApi } from './api.ts'
import { McpHttpClient } from './mcp.ts'

export const name = 'sport-health'

/** The web server is the only required service; on headless profiles the plugin simply waits. */
export const inject = ['webServer']

const ROUTE_PREFIX = '/sport-health/api'

export interface SportHealthHostConfig {
  /** Streamable-HTTP endpoint of the sport-health MCP server. */
  url?: string
  /** Per-request MCP timeout. */
  timeoutMs?: number
  /** Dashboard snapshot cache TTL. */
  cacheTtlMs?: number
}

interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

interface HostContext {
  webServer: WebServerLike
  effect(execute: () => () => void, label?: string): unknown
  logger?: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
}

export function apply(ctx: HostContext, config: SportHealthHostConfig = {}): void {
  const resolved = {
    url: config.url ?? 'http://127.0.0.1:8080/mcp',
    timeoutMs: config.timeoutMs ?? 10_000,
    cacheTtlMs: config.cacheTtlMs ?? 10_000,
  }
  const client = new McpHttpClient(resolved)
  const api = createSportHealthApi(client, resolved)
  const handler = createHandler(api, resolved.url)

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler,
    })
    ctx.logger?.info('sport-health: dashboard API mounted at %s (MCP %s)', ROUTE_PREFIX, resolved.url)
    return () => {
      dispose()
      ctx.logger?.info('sport-health: dashboard API unmounted')
    }
  }, 'sport-health: dashboard api')
}

function createHandler(api: ReturnType<typeof createSportHealthApi>, url: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: '只支持 GET 请求' }, method === 'HEAD')
      return
    }

    let requestUrl: URL
    try {
      requestUrl = new URL(req.url ?? '/', 'http://dsh.local')
    } catch {
      sendJson(res, 400, { ok: false, error: '无效的请求 URL' }, method === 'HEAD')
      return
    }

    const path = requestUrl.pathname.replace(/\/+$/, '') || '/'
    try {
      if (path === ROUTE_PREFIX) {
        sendJson(res, 200, {
          ok: true,
          service: 'dsh-sport-health',
          url,
          endpoints: ['/sport-health/api/health', '/sport-health/api/overview', '/sport-health/api/runs', '/sport-health/api/run?id=<runId>'],
        }, method === 'HEAD')
        return
      }

      if (path === `${ROUTE_PREFIX}/health`) {
        sendJson(res, 200, await api.health(), method === 'HEAD')
        return
      }

      if (path === `${ROUTE_PREFIX}/overview`) {
        const refresh = ['1', 'true', 'yes'].includes((requestUrl.searchParams.get('refresh') ?? '').toLowerCase())
        sendJson(res, 200, await api.overview(refresh), method === 'HEAD')
        return
      }

      if (path === `${ROUTE_PREFIX}/runs`) {
        sendJson(res, 200, await api.runs(requestUrl.searchParams), method === 'HEAD')
        return
      }

      if (path === `${ROUTE_PREFIX}/run`) {
        const runId = requestUrl.searchParams.get('id') ?? requestUrl.searchParams.get('runId')
        if (runId === null || runId.trim() === '') {
          sendJson(res, 400, { ok: false, error: '缺少 runId 参数' }, method === 'HEAD')
          return
        }
        sendJson(res, 200, await api.run(runId.trim()), method === 'HEAD')
        return
      }

      sendJson(res, 404, { ok: false, error: `未知接口：${path}` }, method === 'HEAD')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 500, { ok: false, error: message }, method === 'HEAD')
    }
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headOnly = false): void {
  if (res.headersSent) {
    res.end()
    return
  }
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'x-content-type-options': 'nosniff',
  })
  if (headOnly) res.end()
  else res.end(payload)
}
