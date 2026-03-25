import https from 'https'
import http from 'http'
import type { UnifiDoor, UnifiLockRule, UnifiLogEntry } from '@/types'

// UniFi Access API client
// Uses Node's http/https modules directly so we can set rejectUnauthorized: false
// (UniFi Access controllers use self-signed certificates)

const httpsAgent = new https.Agent({ rejectUnauthorized: false, maxSockets: 4, keepAlive: true })
const httpAgent = new http.Agent({ maxSockets: 4, keepAlive: true })

export class UnifiClient {
  private baseUrl: string
  private apiKey: string

  constructor(host: string, apiKey: string) {
    // host can be "ip:port", "hostname:port", or a full URL like "https://ip:port"
    this.baseUrl = host.startsWith('http') ? host.replace(/\/$/, '') : `https://${host}`
    this.apiKey = apiKey
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const isHttps = url.startsWith('https')
    const agent = isHttps ? httpsAgent : httpAgent

    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...(options.headers as Record<string, string> | undefined) },
      // @ts-expect-error — Node.js fetch (undici) accepts agent via this non-standard field;
      // falls back gracefully if ignored
      agent,
    }).catch(async () => {
      // Fallback: use Node's https.request directly if fetch rejects cert
      return nodeRequest(url, this.headers, options)
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`UniFi API ${res.status}: ${text}`)
    }

    const json = await res.json()
    if (json.code !== 'SUCCESS') {
      throw new Error(`UniFi API error: ${json.msg}`)
    }
    return json.data as T
  }

  async getDoors(): Promise<UnifiDoor[]> {
    return this.request<UnifiDoor[]>('/api/v1/developer/doors')
  }

  async getLockRule(doorId: string): Promise<UnifiLockRule | null> {
    try {
      return await this.request<UnifiLockRule>(`/api/v1/developer/doors/${doorId}/lock_rule`)
    } catch {
      return null
    }
  }

  async unlockDoor(doorId: string, actorId?: string, actorName?: string): Promise<void> {
    const body = actorId && actorName ? { actor_id: actorId, actor_name: actorName } : {}
    await this.request(`/api/v1/developer/doors/${doorId}/unlock`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  async setLockRule(
    doorId: string,
    type: 'keep_lock' | 'keep_unlock' | 'custom' | 'reset' | 'lock_early',
    interval?: number
  ): Promise<void> {
    const body: { type: string; interval?: number } = { type }
    if (type === 'custom' && interval) body.interval = interval
    await this.request(`/api/v1/developer/doors/${doorId}/lock_rule`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  async getLogs(params: {
    topic?: string
    since?: number
    until?: number
    actorId?: string
    pageSize?: number
  }): Promise<UnifiLogEntry[]> {
    const { topic = 'door_openings', since, until, actorId, pageSize = 500 } = params
    const PAGE_SIZE = 100 // UniFi safe page size
    const body: Record<string, unknown> = { topic }
    if (since) body.since = since
    if (until) body.until = until
    if (actorId) body.actor_id = actorId

    type RawTarget = { id: string; display_name: string; type: string }
    type RawHit = {
      _id: string
      _source: {
        actor: { id: string; display_name: string; type: string }
        authentication: { credential_provider: string; issuer: string }
        event: { type: string; log_key: string; published: number; display_message: string; result: string }
        target: RawTarget[]
      }
    }
    type RawResult = { hits?: RawHit[]; pagination?: { total: number; page_num: number; page_size: number } }

    const parseHits = (hits: RawHit[]) => hits.map((h) => {
      const s = h._source
      // Check type 'door' first; fall back to any target (covers lockdown/schedule events
      // where UniFi may use a different target type like 'device')
      const doorTarget = s.target?.find((t) => t.type === 'door') ?? s.target?.[0]
      // For position-change events, the door itself is the actor (type: 'door'), not the target
      const actorIsDoor = s.actor?.type === 'door'
      return {
        id: h._id,
        actor: { id: s.actor.id, display_name: s.actor.display_name, type: s.actor.type },
        event: {
          type: s.event.type,
          log_key: s.event.log_key ?? '',
          display_message: s.event.display_message ?? '',
          result: s.event.result ?? '',
          object_id: doorTarget?.id ?? (actorIsDoor ? s.actor.id : ''),
          object_name: doorTarget?.display_name ?? (actorIsDoor ? s.actor.display_name : ''),
          timestamp: s.event.published ? Math.floor(s.event.published / 1000) : 0,
        },
        authentication: { credential_provider: s.authentication?.credential_provider ?? '', issuer: s.authentication?.issuer ?? '' },
      }
    })

    // Fetch first page
    const first = await this.request<RawResult>(
      `/api/v1/developer/system/logs?page_num=1&page_size=${PAGE_SIZE}`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    const allHits = [...(first.hits ?? [])]

    // UniFi's pagination.total is unreliable (always equals page size).
    // Fetch pages in parallel batches of 4 (within maxSockets cap) until partial page or cap.
    const BATCH = 4
    let pageNum = 2
    let prevBatchFull = (first.hits?.length ?? 0) === PAGE_SIZE
    while (prevBatchFull && allHits.length < pageSize) {
      const batchSize = Math.min(BATCH, Math.ceil((pageSize - allHits.length) / PAGE_SIZE))
      const pages = await Promise.all(
        Array.from({ length: batchSize }, (_, i) =>
          this.request<RawResult>(
            `/api/v1/developer/system/logs?page_num=${pageNum + i}&page_size=${PAGE_SIZE}`,
            { method: 'POST', body: JSON.stringify(body) }
          )
        )
      )
      prevBatchFull = true
      for (const page of pages) {
        const hits = page.hits ?? []
        allHits.push(...hits)
        if (hits.length < PAGE_SIZE) { prevBatchFull = false; break }
      }
      pageNum += batchSize
    }

    return parseHits(allHits.slice(0, pageSize))
  }

  async listWebhooks(): Promise<any[]> {
    return this.request<any[]>('/api/v1/developer/webhooks/endpoints')
  }

  async registerWebhook(
    name: string,
    endpoint: string,
    events: string[]
  ): Promise<{ id: string; secret: string; endpoint: string; events: string[] }> {
    return this.request<{ id: string; secret: string; endpoint: string; events: string[] }>(
      '/api/v1/developer/webhooks/endpoints',
      {
        method: 'POST',
        body: JSON.stringify({ name, endpoint, events }),
      }
    )
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request(`/api/v1/developer/webhooks/endpoints/${id}`, { method: 'DELETE' })
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getDoors()
      return true
    } catch {
      return false
    }
  }
}

// Fallback: raw Node.js https/http request that always ignores cert errors
function nodeRequest(
  url: string,
  headers: Record<string, string>,
  options: RequestInit
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? https : http

    const bodyBuf = options.body ? Buffer.from(options.body as string, 'utf8') : null

    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: (options.method as string) || 'GET',
      headers: bodyBuf
        ? { ...headers, 'Content-Length': String(bodyBuf.length) }
        : headers,
      rejectUnauthorized: false,
    }

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        const status = res.statusCode ?? 200
        resolve(new Response(body, { status, headers: res.headers as HeadersInit }))
      })
    })

    req.on('error', reject)
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

export function clientForTenant(tenant: { unifiHost: string; unifiApiKey: string }): UnifiClient {
  return new UnifiClient(tenant.unifiHost, tenant.unifiApiKey)
}
