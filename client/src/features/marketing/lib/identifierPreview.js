/**
 * Browser port of the server's identifier normalization
 * (server/src/utils/assetIdentifiers.js) for the landing-page demo. The server
 * remains the authority: this copy only illustrates the rules, and nothing
 * here is sent anywhere or makes a network request.
 */

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** 4, 6 or 0, like node:net isIP. */
function ipVersion(value) {
  if (IPV4.test(value)) return 4
  if (!value.includes(':') || /[^0-9a-f:.]/i.test(value)) return 0
  try {
    new URL(`http://[${value}]/`)
    return 6
  } catch {
    return 0
  }
}

function hasControl(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 32 || (code >= 127 && code < 160)) return true
  }
  return false
}

function url(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { error: 'Enter a full URL, like https://api.example.com' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'Use an http:// or https:// URL' }
  if (parsed.username || parsed.password) return { error: "Don't include credentials in the URL" }
  if (!parsed.hostname) return { error: 'Enter a full URL, like https://api.example.com' }
  const path = parsed.pathname.replace(/\/+$/, '')
  return { normalized: `${parsed.protocol}//${parsed.host}${path}` }
}

function hostname(raw) {
  const host = raw.toLowerCase().replace(/\.$/, '')
  if (ipVersion(host)) return { error: 'This is an IP address — choose "IP address"' }
  if (!HOSTNAME.test(host)) return { error: 'Enter a hostname, like api.example.com' }
  return { normalized: host }
}

function ipAddress(raw) {
  const [address, prefix, ...rest] = raw.split('/')
  const version = ipVersion(address)
  if (!version || rest.length) return { error: 'Enter an IPv4 or IPv6 address (CIDR allowed)' }
  if (prefix !== undefined) {
    const bits = Number(prefix)
    if (!/^\d{1,3}$/.test(prefix) || bits > (version === 4 ? 32 : 128)) return { error: 'Enter a valid CIDR prefix' }
  }
  const normalized = version === 6 ? address.toLowerCase() : address
  return { normalized: prefix === undefined ? normalized : `${normalized}/${Number(prefix)}` }
}

function repository(raw) {
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
  return { normalized: `${host.toLowerCase()}/${path.toLowerCase()}` }
}

function containerImage(raw) {
  if (/\s/.test(raw) || !/^[a-z0-9][a-z0-9._\-/:@]*$/i.test(raw)) return { error: 'Enter an image reference, like registry/app:1.4' }
  return { normalized: raw.toLowerCase() }
}

const opaque = (raw) => ({ normalized: raw })

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

/** → { key, normalized } or { error } */
export function previewIdentifier(kind, input) {
  const raw = String(input ?? '').trim()
  if (!raw) return { error: 'Enter a value' }
  if (hasControl(raw)) return { error: 'Remove control characters' }
  const normalizer = NORMALIZERS[kind]
  if (!normalizer) return { error: 'Choose an identifier type' }
  const result = normalizer(raw)
  return result.error ? result : { normalized: result.normalized, key: `${kind}:${result.normalized}` }
}
