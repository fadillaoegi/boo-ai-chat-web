import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'

interface ProxyOptions {
  baseUrl: string
  apiKey?: string
}

type LogLevel = 'info' | 'warn' | 'error'

function proxyLog(level: LogLevel, event: string, details: Record<string, unknown> = {}) {
  const line = `[9router-proxy] ${event} ${JSON.stringify(details)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    // Konteks besar + hingga 4 gambar unggahan (~900 KB base64 masing-masing).
    if (size > 16_000_000) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function upstreamErrorMessage(rawBody: string, status: number): string {
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } }
    return parsed.error?.message || `Upstream merespons HTTP ${status}.`
  } catch {
    return `Upstream merespons HTTP ${status}.`
  }
}

function safeBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return 'invalid-url'
  }
}

function nineRouterProxy({ baseUrl, apiKey }: ProxyOptions): Plugin {
  const handleRequest = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const route = pathname === '/api/models' ? 'models'
      : pathname === '/api/models/vision' ? 'vision-models'
        : pathname === '/api/models/image' ? 'image-models'
          : pathname === '/api/chat' ? 'chat'
            : pathname === '/api/images/generations' ? 'image-generation'
              : pathname === '/api/status' ? 'status'
                : null
    if (!route) return next()

    const expectedMethod = route === 'chat' || route === 'image-generation' ? 'POST' : 'GET'
    if (request.method !== expectedMethod) {
      return writeJson(response, 405, { error: { message: 'Method tidak diizinkan.' } })
    }

    const requestId = randomUUID().slice(0, 8)
    const startedAt = Date.now()
    // Batalkan request ke 9Router jika browser memutus koneksi (tombol Stop atau tab ditutup).
    const upstreamAbort = new AbortController()
    response.on('close', () => {
      if (!response.writableFinished) upstreamAbort.abort()
    })
    response.setHeader('X-Request-Id', requestId)
    proxyLog('info', 'request.start', { requestId, route, method: request.method })

    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`

      if (route === 'status') {
        if (!apiKey) {
          proxyLog('warn', 'auth.missing_key', {
            requestId,
            durationMs: Date.now() - startedAt,
            apiKeyConfigured: false,
          })
          return writeJson(response, 200, {
            state: 'misconfigured',
            message: 'NINEROUTER_KEY belum dikonfigurasi. Buat .env.local lalu restart pnpm dev.',
            apiKeyConfigured: false,
          })
        }

        const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
        const upstream = await fetch(new URL('v1/models', normalizedBase), { headers })
        const rawBody = await upstream.text()
        const durationMs = Date.now() - startedAt

        if (upstream.ok) {
          proxyLog('info', 'auth.connected', { requestId, status: upstream.status, durationMs })
          return writeJson(response, 200, {
            state: 'connected',
            message: 'Terhubung dan terautentikasi ke 9Router.',
            apiKeyConfigured: Boolean(apiKey),
          })
        }

        const upstreamMessage = upstreamErrorMessage(rawBody, upstream.status)
        const missingKey = /missing api key/i.test(upstreamMessage) && !apiKey
        proxyLog('warn', 'auth.rejected', {
          requestId,
          status: upstream.status,
          durationMs,
          apiKeyConfigured: Boolean(apiKey),
          message: upstreamMessage,
        })
        return writeJson(response, 200, {
          state: missingKey ? 'misconfigured' : 'error',
          message: missingKey
            ? 'NINEROUTER_KEY belum dikonfigurasi. Buat .env.local lalu restart pnpm dev.'
            : `Autentikasi 9Router gagal: ${upstreamMessage}`,
          apiKeyConfigured: Boolean(apiKey),
        })
      }

      let body: string | undefined
      let wantsStream = false
      if (route === 'chat' || route === 'image-generation') {
        headers['Content-Type'] = 'application/json'
        const rawBody = await readRequestBody(request)
        const payload = JSON.parse(rawBody) as { model?: unknown; messages?: unknown; prompt?: unknown }
        const invalidChat = route === 'chat'
          && (typeof payload.model !== 'string' || !Array.isArray(payload.messages))
        const invalidImage = route === 'image-generation'
          && (typeof payload.model !== 'string' || typeof payload.prompt !== 'string' || !payload.prompt.trim())
        if (invalidChat || invalidImage) {
          proxyLog('warn', 'request.invalid', { requestId, route })
          return writeJson(response, 400, { error: { message: 'Model atau payload tidak valid.' } })
        }
        wantsStream = route === 'chat' && (payload as { stream?: unknown }).stream === true
        body = JSON.stringify(route === 'chat' ? { ...payload, stream: wantsStream } : payload)
      }

      const upstreamPath = route === 'models' ? 'v1/models'
        : route === 'vision-models' ? 'v1/models/image-to-text'
          : route === 'image-models' ? 'v1/models/image'
            : route === 'image-generation' ? 'v1/images/generations'
              : 'v1/chat/completions'
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
      const upstream = await fetch(new URL(upstreamPath, normalizedBase), {
        method: request.method,
        headers,
        body,
        signal: upstreamAbort.signal,
      })
      const contentType = upstream.headers.get('content-type')

      if (wantsStream && upstream.ok && upstream.body && contentType?.includes('text/event-stream')) {
        response.statusCode = upstream.status
        response.setHeader('Content-Type', contentType)
        response.setHeader('Cache-Control', 'no-cache')
        response.setHeader('X-Accel-Buffering', 'no')
        response.flushHeaders()
        for await (const chunk of upstream.body) response.write(chunk)
        response.end()
        proxyLog('info', 'request.success', {
          requestId,
          route,
          status: upstream.status,
          durationMs: Date.now() - startedAt,
          streamed: true,
        })
        return
      }

      const rawResponse = await upstream.text()
      if (contentType) response.setHeader('Content-Type', contentType)
      response.statusCode = upstream.status
      response.end(rawResponse)

      const details: Record<string, unknown> = {
        requestId,
        route,
        status: upstream.status,
        durationMs: Date.now() - startedAt,
      }
      if (!upstream.ok) details.message = upstreamErrorMessage(rawResponse, upstream.status)
      proxyLog(upstream.ok ? 'info' : 'warn', upstream.ok ? 'request.success' : 'request.failed', details)
    } catch (error) {
      if (upstreamAbort.signal.aborted) {
        proxyLog('info', 'request.aborted', { requestId, route, durationMs: Date.now() - startedAt })
        return
      }
      const tooLarge = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE'
      const message = error instanceof Error ? error.message : 'Unknown proxy error'
      proxyLog('error', 'request.error', {
        requestId,
        route,    
        durationMs: Date.now() - startedAt,
        message,
      })
      if (response.headersSent) {
        response.end()
        return
      }
      writeJson(response, tooLarge ? 413 : 502, {
        error: { message: tooLarge ? 'Pesan terlalu besar.' : 'Tidak dapat terhubung ke layanan 9Router.' },
      })
    }
  }

  return {
    name: 'nine-router-secure-proxy',
    configResolved() {
      proxyLog('info', 'config.loaded', {
        baseUrl: safeBaseUrl(baseUrl),
        apiKeyConfigured: Boolean(apiKey),
      })
    },
    configureServer(server) {
      server.middlewares.use(handleRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleRequest)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: '/apps/booAi/',
    plugins: [
      react(),
      tailwindcss(),
      nineRouterProxy({
        baseUrl: env.NINEROUTER_URL || 'http://localhost:20128',
        apiKey: env.NINEROUTER_KEY,
      }),
    ],
  }
})
