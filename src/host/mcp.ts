/**
 * Minimal MCP Streamable-HTTP client used by the dashboard proxy.
 *
 * The official `dsh-mcp-client` already connects to the same server for the
 * model-facing tools. This tiny client exists because the dashboard is just a
 * browser view: it needs read-only JSON snapshots and cannot call Host tools
 * directly. It implements only `initialize`, `notifications/initialized`,
 * `tools/list` and `tools/call`, with session recovery and a short TTL cache.
 */
export interface McpHttpClientOptions {
  url: string
  timeoutMs?: number
  cacheTtlMs?: number
}

export class McpHttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'McpHttpError'
  }
}

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number | string | null
  result?: any
  error?: { code?: number; message?: string; data?: unknown }
}

interface CacheEntry {
  expires: number
  value: Promise<unknown>
}

const PROTOCOL_VERSION = '2025-06-18'
const CLIENT_INFO = { name: 'dsh-sport-health', version: '0.1.0' } as const

export class McpHttpClient {
  readonly url: string
  private readonly timeoutMs: number
  private readonly cacheTtlMs: number
  private sessionId: string | undefined
  private protocolVersion: string | undefined
  private nextId = 1
  private initializing: Promise<void> | undefined
  private readonly cache = new Map<string, CacheEntry>()

  constructor(options: McpHttpClientOptions) {
    this.url = options.url
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.cacheTtlMs = options.cacheTtlMs ?? 10_000
  }

  /** Drop cached tool results (used by the dashboard's refresh button). */
  clearCache(): void {
    this.cache.clear()
  }

  /** Discover the server's tools; also acts as the dashboard health probe. */
  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    const result = await this.request('tools/list', {})
    return Array.isArray(result?.tools) ? result.tools : []
  }

  /** Call one raw MCP tool and return its decoded JSON payload. */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const key = `${name}:${stableKey(args)}`
    const now = Date.now()
    const hit = this.cache.get(key)
    if (hit && hit.expires > now) return hit.value
    if (hit) this.cache.delete(key)

    const value = this.request('tools/call', { name, arguments: args }).then(result => decodeToolResult(name, result))
    const entry: CacheEntry = { expires: now + this.cacheTtlMs, value }
    this.cache.set(key, entry)
    value.catch(() => this.cache.delete(key))
    return value
  }

  private async request(method: string, params: Record<string, unknown>): Promise<any> {
    await this.ensureSession()
    try {
      return await this.sendRequest(method, params)
    } catch (error) {
      if (!this.shouldRetry(error)) throw error
      // The server may have expired the session. Re-handshake once and replay.
      this.resetSession()
      await this.ensureSession()
      return this.sendRequest(method, params)
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId !== undefined) return
    this.initializing ??= this.initialize().finally(() => { this.initializing = undefined })
    return this.initializing
  }

  private async initialize(): Promise<void> {
    const response = await this.send({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    }, true)
    this.protocolVersion = response.body?.result?.protocolVersion ?? PROTOCOL_VERSION
    if (response.sessionId !== undefined) this.sessionId = response.sessionId
    // Best effort: some servers return 202, others 200 with an empty body.
    await this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, false)
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<any> {
    const id = this.nextId++
    const response = await this.send({ jsonrpc: '2.0', id, method, params }, true)
    const message = response.body
    if (message === undefined || message === null) {
      throw new McpHttpError(`MCP ${method} returned an empty response`, response.status)
    }
    if (message.error !== undefined) {
      throw new McpHttpError(`MCP ${method} failed: ${message.error.message ?? 'unknown error'}`, response.status)
    }
    if (message.result === undefined) {
      throw new McpHttpError(`MCP ${method} returned no result`, response.status)
    }
    return message.result
  }

  private async send(payload: Record<string, unknown>, expectResponse: boolean): Promise<{
    body: JsonRpcResponse | undefined
    sessionId: string | undefined
    status: number
  }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    }
    if (this.sessionId !== undefined) headers['mcp-session-id'] = this.sessionId
    if (this.protocolVersion !== undefined) headers['mcp-protocol-version'] = this.protocolVersion

    let response: Response
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new McpHttpError(`无法连接 sport-health MCP 服务 (${this.url})：${message}`)
    }

    const sessionId = response.headers.get('mcp-session-id') ?? undefined
    if (sessionId !== undefined) this.sessionId = sessionId

    if (response.status === 202 || response.status === 204) {
      await response.body?.cancel()
      return { body: undefined, sessionId, status: response.status }
    }

    const text = await response.text()
    if (!response.ok) {
      const hint = text.length > 400 ? `${text.slice(0, 400)}…` : text
      throw new McpHttpError(`MCP HTTP ${response.status}: ${hint || response.statusText}`, response.status)
    }
    if (!expectResponse) return { body: undefined, sessionId, status: response.status }

    const body = decodeResponse(text, response.headers.get('content-type') ?? '', payload.id as number | string)
    return { body, sessionId, status: response.status }
  }

  private resetSession(): void {
    this.sessionId = undefined
    this.protocolVersion = undefined
    this.cache.clear()
  }

  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof McpHttpError)) return false
    if (error.status === 404 || error.status === 408 || error.status === 429) return true
    if (error.status === 400) return true
    return /session|expired|initialized|not initialized/i.test(error.message)
  }
}

/** Parse either a plain JSON body or a one-shot SSE answer. */
function decodeResponse(text: string, contentType: string, requestId: number | string): JsonRpcResponse | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined

  if (contentType.includes('text/event-stream')) {
    const messages: JsonRpcResponse[] = []
    let data: string[] = []
    const flush = () => {
      if (data.length === 0) return
      const raw = data.join('\n')
      data = []
      try {
        const parsed = JSON.parse(raw) as JsonRpcResponse
        if (parsed && typeof parsed === 'object') messages.push(parsed)
      } catch {
        // Ignore keep-alive/non-JSON SSE events.
      }
    }
    for (const line of trimmed.split(/\r?\n/)) {
      if (line === '') { flush(); continue }
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    flush()
    return messages.find(message => message.id === requestId)
      ?? messages.filter(message => message.result !== undefined || message.error !== undefined).at(-1)
      ?? messages.at(-1)
  }

  try {
    const parsed = JSON.parse(trimmed) as JsonRpcResponse | JsonRpcResponse[]
    if (Array.isArray(parsed)) {
      return parsed.find(message => message.id === requestId) ?? parsed.at(-1)
    }
    return parsed
  } catch {
    throw new McpHttpError(`MCP 返回了无法解析的响应：${trimmed.slice(0, 200)}`)
  }
}

/** Decode the MCP CallToolResult into the JSON document the server embedded in text. */
function decodeToolResult(toolName: string, result: any): unknown {
  const content = Array.isArray(result?.content) ? result.content : []
  const text = content
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => String(block?.text ?? ''))
    .join('\n')
    .trim()

  if (result?.isError === true) {
    throw new Error(text || `MCP 工具 ${toolName} 返回错误`)
  }
  if (text === '' && result?.structuredContent !== undefined) return result.structuredContent
  if (text === '') return result
  try {
    return JSON.parse(text)
  } catch {
    return { text }
  }
}

function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableKey(record[key])}`).join(',')}}`
}
