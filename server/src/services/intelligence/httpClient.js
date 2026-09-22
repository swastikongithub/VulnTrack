/**
 * Outbound HTTP for source adapters.
 *
 *  - URLs are built by adapters from fixed provider base URLs; nothing a user
 *    or an organization supplies is ever fetched (no SSRF surface).
 *  - Every request has a timeout and a response-size cap, read as a stream so
 *    an oversized body is abandoned rather than buffered.
 *  - 429 and 5xx responses and network errors are retried with exponential
 *    backoff, honouring Retry-After (capped).
 *  - `minIntervalMs` spaces requests out, for providers with published rate
 *    limits (NVD: 5 requests / 30 s without an API key).
 *  - Errors carry the host and path only: never the query string or headers,
 *    where credentials could live.
 *
 * `fetch` and `sleep` are injectable so adapters are tested against recorded
 * payloads without network access.
 */

export class SourceRequestError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message)
    this.name = 'SourceRequestError'
    this.status = status
    this.retryable = retryable
  }
}

const describe = (url) => {
  const { host, pathname } = new URL(url)
  return `${host}${pathname}`
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createHttpClient({
  fetch = globalThis.fetch,
  sleep = defaultSleep,
  headers = {},
  timeoutMs = 60_000,
  maxBytes = 64 * 1024 * 1024,
  retries = 3,
  backoffMs = 2_000,
  minIntervalMs = 0,
  userAgent = 'VulnTrack-Intelligence/1.0',
} = {}) {
  let nextSlot = 0

  async function throttle() {
    if (!minIntervalMs) return
    const now = Date.now()
    const wait = nextSlot - now
    nextSlot = Math.max(now, nextSlot) + minIntervalMs
    if (wait > 0) await sleep(wait)
  }

  async function send(url, init) {
    let attempt = 0
    for (;;) {
      await throttle()
      let response
      try {
        response = await fetch(url, {
          ...init,
          headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers, ...init.headers },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        })
      } catch (error) {
        const reason = error?.name === 'TimeoutError' ? 'timed out' : 'network error'
        if (attempt < retries) {
          await sleep(backoffMs * 2 ** attempt++)
          continue
        }
        throw new SourceRequestError(`${describe(url)} ${reason}`, { retryable: true })
      }
      if (response.ok) return response

      const retryable = response.status === 429 || response.status >= 500
      await response.body?.cancel().catch(() => {})
      if (retryable && attempt < retries) {
        const retryAfter = Number(response.headers.get('retry-after'))
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : backoffMs * 2 ** attempt
        attempt++
        await sleep(delay)
        continue
      }
      throw new SourceRequestError(`${describe(url)} responded ${response.status}`, { status: response.status, retryable })
    }
  }

  /** Reads a body as text, abandoning it past `maxBytes`. */
  async function readCapped(response, url) {
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => {})
      throw new SourceRequestError(`${describe(url)} response exceeds ${maxBytes} bytes`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let size = 0
    let text = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new SourceRequestError(`${describe(url)} response exceeds ${maxBytes} bytes`)
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  }

  async function parse(response, url) {
    const body = await readCapped(response, url)
    try {
      return JSON.parse(body)
    } catch {
      throw new SourceRequestError(`${describe(url)} returned invalid JSON`)
    }
  }

  return {
    /** GET → parsed JSON. 404 resolves to null (the record doesn't exist upstream). */
    async getJson(url) {
      try {
        return await parse(await send(url, { method: 'GET' }), url)
      } catch (error) {
        if (error instanceof SourceRequestError && error.status === 404) return null
        throw error
      }
    },

    async postJson(url, body) {
      const response = await send(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
      return parse(response, url)
    },

    /**
     * Streams a text resource line by line. `onLine` returns false to stop
     * early (the rest of the body is not downloaded).
     */
    async eachLine(url, onLine) {
      const response = await send(url, { method: 'GET', headers: { Accept: 'text/csv, text/plain' } })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffered = ''
      let size = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) throw new SourceRequestError(`${describe(url)} response exceeds ${maxBytes} bytes`)
          buffered += decoder.decode(value, { stream: true })
          let newline
          while ((newline = buffered.indexOf('\n')) !== -1) {
            const line = buffered.slice(0, newline).replace(/\r$/, '')
            buffered = buffered.slice(newline + 1)
            if (line && onLine(line) === false) return
          }
        }
        const last = (buffered + decoder.decode()).trim()
        if (last) onLine(last)
      } finally {
        await reader.cancel().catch(() => {})
      }
    },
  }
}
