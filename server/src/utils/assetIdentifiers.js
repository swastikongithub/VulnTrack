import { isIP } from 'node:net'
import { hasControlCharacters } from './text.js'

/**
 * Identifier normalization. Two identifiers that point at the same thing must
 * normalize to the same key, so duplicates are caught now and future scanners
 * can match discovered systems to inventory records.
 *
 * Each normalizer returns { value, normalized } or { error } (a field message).
 * Stored `value` keeps what the user entered (trimmed); `normalized` is the
 * comparison form. Nothing here makes network requests.
 */

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/

function url(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { error: 'Enter a full URL, like https://api.example.com' }
  }
  // Only web URLs: javascript:, data:, file: etc. are never valid asset identifiers.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'Use an http:// or https:// URL' }
  if (parsed.username || parsed.password) return { error: "Don't include credentials in the URL" }
  if (!parsed.hostname) return { error: 'Enter a full URL, like https://api.example.com' }
  const path = parsed.pathname.replace(/\/+$/, '')
  // URL() already lower-cases the scheme and host and drops default ports. Query and fragment are not identity.
  return { value: raw, normalized: `${parsed.protocol}//${parsed.host}${path}` }
}

function hostname(raw) {
  const host = raw.toLowerCase().replace(/\.$/, '')
  if (isIP(host)) return { error: 'This is an IP address — choose "IP address"' }
  if (!HOSTNAME.test(host)) return { error: 'Enter a hostname, like api.example.com' }
  return { value: raw, normalized: host }
}

function ipAddress(raw) {
  const [address, prefix, ...rest] = raw.split('/')
  const version = isIP(address)
  if (!version || rest.length) return { error: 'Enter an IPv4 or IPv6 address (CIDR allowed)' }
  if (prefix !== undefined) {
    const bits = Number(prefix)
    if (!/^\d{1,3}$/.test(prefix) || bits > (version === 4 ? 32 : 128)) return { error: 'Enter a valid CIDR prefix' }
  }
  const normalized = version === 6 ? address.toLowerCase() : address
  return { value: raw, normalized: prefix === undefined ? normalized : `${normalized}/${Number(prefix)}` }
}

function repository(raw) {
  // Accept https URLs, git@host:owner/repo(.git) and host/owner/repo forms; key on host/path.
  let host
  let path
  const scp = raw.match(/^git@([^:]+):(.+)$/)
  if (scp) {
    ;[, host, path] = scp
  } else {
    try {
      const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (!['https:', 'http:', 'ssh:', 'git:'].includes(parsed.protocol)) return { error: 'Enter a repository URL' }
      if (parsed.password) return { error: "Don't include credentials in the URL" }
      host = parsed.hostname
      path = parsed.pathname
    } catch {
      return { error: 'Enter a repository URL, like github.com/org/repo' }
    }
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
  if (!HOSTNAME.test(host.toLowerCase()) || path.split('/').filter(Boolean).length < 2) {
    return { error: 'Enter a repository URL, like github.com/org/repo' }
  }
  return { value: raw, normalized: `${host.toLowerCase()}/${path.toLowerCase()}` }
}

function containerImage(raw) {
  if (/\s/.test(raw) || !/^[a-z0-9][a-z0-9._\-/:@]*$/i.test(raw)) return { error: 'Enter an image reference, like registry/app:1.4' }
  return { value: raw, normalized: raw.toLowerCase() }
}

/** Case-sensitive, opaque identifiers (ARNs, resource IDs, package coordinates, anything else). */
function opaque(raw) {
  return { value: raw, normalized: raw }
}

const NORMALIZERS = {
  url,
  hostname,
  ip_address: ipAddress,
  repository,
  cloud_resource_id: opaque,
  container_image: containerImage,
  package: opaque,
  other: opaque,
}

export function normalizeIdentifier(kind, input) {
  const raw = String(input ?? '').trim()
  if (!raw) return { error: 'Enter a value' }
  if (hasControlCharacters(raw)) return { error: 'Remove control characters' }
  const normalizer = NORMALIZERS[kind]
  if (!normalizer) return { error: 'Choose an identifier type' }
  return normalizer(raw)
}

/** The uniqueness key stored on the asset: kind + normalized value. */
export function identifierKey(kind, normalized) {
  return `${kind}:${normalized}`
}
