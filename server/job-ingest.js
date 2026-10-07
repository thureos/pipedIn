import { lookup as dnsLookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib'
import ipaddr from 'ipaddr.js'
import { extractJobPosting } from '../src/services/jobPosting.js'
import { embeddedJobData } from './structured-data.js'

const MAX_URL_LENGTH = 2048
const MAX_HTML_BYTES = 1_048_576
const MAX_SOURCE_BYTES = 10 * MAX_HTML_BYTES
// JSON escaping can expand each source byte to six bytes.
const MAX_BODY_BYTES = 6 * MAX_SOURCE_BYTES + 4096
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 7000
const MAX_TOTAL_FETCH_MS = 12_000
const DNS_TIMEOUT_MS = 3000
const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 8
const MAX_IN_FLIGHT = 4
const blockedNetworks = [
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '2001:db8::/32',
  '2001::/23',
  '2002::/16',
  '3fff::/20',
].map((network) => ipaddr.parseCIDR(network))

class ServiceError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function isPublicAddress(address) {
  try {
    const parsed = ipaddr.parse(address)
    if (parsed.range() !== 'unicast') return false
    return !blockedNetworks.some(
      (network) => parsed.kind() === network[0].kind() && parsed.match(network),
    )
  } catch {
    return false
  }
}

export function parseTargetUrl(input) {
  if (typeof input !== 'string' || input.length > MAX_URL_LENGTH)
    throw new ServiceError(400, 'Enter a valid job posting URL.')
  let target
  try {
    target = new URL(input)
  } catch {
    throw new ServiceError(400, 'Enter a valid job posting URL.')
  }
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.hash
  )
    throw new ServiceError(400, 'Only public http and https job URLs are supported.')
  if (target.port && target.port !== (target.protocol === 'https:' ? '443' : '80'))
    throw new ServiceError(400, 'Only standard web ports are supported.')
  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.onion')
  )
    throw new ServiceError(400, 'This hostname is not allowed.')
  if (isIP(hostname) && !isPublicAddress(hostname))
    throw new ServiceError(400, 'Private or reserved network addresses are not allowed.')
  return target
}

function withTimeout(promise, milliseconds, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ServiceError(502, message)), milliseconds)
    }),
  ]).finally(() => clearTimeout(timer))
}

export async function resolvePublicAddresses(
  hostname,
  resolver = dnsLookup,
  timeoutMs = DNS_TIMEOUT_MS,
) {
  const cleanHostname = hostname.replace(/^\[|\]$/g, '')
  if (isIP(cleanHostname)) {
    if (!isPublicAddress(cleanHostname))
      throw new ServiceError(400, 'Private or reserved network addresses are not allowed.')
    return [{ address: cleanHostname, family: isIP(cleanHostname) }]
  }
  let records
  try {
    records = await withTimeout(
      resolver(cleanHostname, { all: true, verbatim: true }),
      Math.max(1, Math.min(DNS_TIMEOUT_MS, timeoutMs)),
      'Job host lookup timed out.',
    )
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError(502, 'The job host could not be resolved.')
  }
  if (!records.length || records.some((record) => !isPublicAddress(record.address)))
    throw new ServiceError(400, 'The job host resolves to a private or reserved network address.')
  return records
}

export function readHtmlResponse(response) {
  const encoding = String(response.headers['content-encoding'] || 'identity')
    .trim()
    .toLowerCase()
  const decompressors = { gzip: createGunzip, deflate: createInflate, br: createBrotliDecompress }
  if (encoding !== 'identity' && !Object.hasOwn(decompressors, encoding)) {
    response.destroy()
    return Promise.reject(
      new ServiceError(415, 'The job page uses an unsupported compression format.'),
    )
  }
  if (Number(response.headers['content-length']) > MAX_HTML_BYTES) {
    response.destroy()
    return Promise.reject(new ServiceError(413, 'The job page is too large to import.'))
  }
  const stream = encoding === 'identity' ? response : decompressors[encoding]()
  return new Promise((resolve, reject) => {
    let settled = false
    let received = 0
    let decoded = 0
    const chunks = []
    const fail = (error) => {
      if (settled) return
      settled = true
      response.destroy()
      if (stream !== response) stream.destroy()
      reject(error)
    }
    const oversized = () => fail(new ServiceError(413, 'The job page is too large to import.'))
    response.on('data', (chunk) => {
      received += chunk.length
      if (received > MAX_HTML_BYTES) oversized()
    })
    response.on('error', fail)
    response.on('aborted', () =>
      fail(new ServiceError(502, 'The job page response was interrupted.')),
    )
    stream.on('error', fail)
    stream.on('data', (chunk) => {
      decoded += chunk.length
      if (decoded > MAX_HTML_BYTES) oversized()
      else chunks.push(chunk)
    })
    stream.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    if (stream !== response) response.pipe(stream)
  })
}

export function jobPageStatusMessage(status) {
  if (status === 401 || status === 403)
    return `This site blocked the import (HTTP ${status}). It may require sign-in or block automated access. Open the job page in your browser and paste its page source below, or add the application manually.`
  if (status === 404 || status === 410)
    return 'This job page is no longer available. Check the URL, or add the application manually.'
  if (status === 429)
    return 'This job site is receiving too many requests. Wait a little and try again, or paste the page source.'
  return `The job site could not load the page (HTTP ${status}). Try again later, paste the page source, or add the application manually.`
}

function requestPage(target, address, timeoutMs = FETCH_TIMEOUT_MS) {
  const transport = target.protocol === 'https:' ? https : http
  const hostname = target.hostname.replace(/^\[|\]$/g, '')
  const options = {
    method: 'GET',
    headers: {
      Accept: 'text/html, application/xhtml+xml;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'pipedIn-job-import/1.0',
    },
    agent: false,
    lookup: (_host, lookupOptions, callback) => {
      if (lookupOptions?.all) callback(null, [address])
      else callback(null, address.address, address.family)
    },
  }
  if (!isIP(hostname)) options.servername = hostname

  return new Promise((resolve, reject) => {
    let settled = false
    let timer
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      error ? reject(error) : resolve(value)
    }
    const request = transport.request(target, options, (response) => {
      const status = response.statusCode || 502
      const location = response.headers.location
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy()
        finish(null, { status, location })
        return
      }
      if (status !== 200) {
        response.destroy()
        finish(new ServiceError(502, jobPageStatusMessage(status)))
        return
      }
      const type = String(response.headers['content-type'] || '').toLowerCase()
      if (!type.startsWith('text/html') && !type.startsWith('application/xhtml+xml')) {
        response.destroy()
        finish(new ServiceError(415, 'The job URL did not return an HTML page.'))
        return
      }
      readHtmlResponse(response).then(
        (html) => finish(null, { status, html }),
        (error) => finish(error),
      )
    })
    timer = setTimeout(
      () => {
        const error = new ServiceError(502, 'Fetching the job page timed out.')
        request.destroy(error)
        finish(error)
      },
      Math.max(1, Math.min(FETCH_TIMEOUT_MS, timeoutMs)),
    )
    request.on('error', (error) => finish(error))
    request.end()
  })
}

export async function fetchPublicHtml(
  input,
  { resolver = dnsLookup, request = requestPage } = {},
  redirects = 0,
  deadline = Date.now() + MAX_TOTAL_FETCH_MS,
) {
  const target = parseTargetUrl(input)
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new ServiceError(502, 'Fetching the job page timed out.')
  const addresses = await resolvePublicAddresses(target.hostname, resolver, remaining)
  const requestRemaining = deadline - Date.now()
  if (requestRemaining <= 0) throw new ServiceError(502, 'Fetching the job page timed out.')
  const response = await request(target, addresses[0], requestRemaining)
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (!response.location || redirects >= MAX_REDIRECTS)
      throw new ServiceError(502, 'The job page redirected too many times.')
    let next
    try {
      next = new URL(response.location, target).href
    } catch {
      throw new ServiceError(502, 'The job page returned an invalid redirect.')
    }
    return fetchPublicHtml(next, { resolver, request }, redirects + 1, deadline)
  }
  if (response.status !== 200) throw new ServiceError(502, jobPageStatusMessage(response.status))
  return response.html
}

export function parseJobPostingHtml(html, sourceUrl) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > MAX_SOURCE_BYTES)
    throw new ServiceError(
      413,
      'The pasted page source is larger than 10 MB. Paste only the job posting section or add the application manually.',
    )
  try {
    return extractJobPosting(embeddedJobData(html), sourceUrl)
  } catch (error) {
    if (error.message.includes('required'))
      throw new ServiceError(
        422,
        'The page’s job details are missing a job title. You can add the application manually.',
      )
    throw new ServiceError(
      422,
      'We couldn’t find job details in this page. The site may load them after the page opens. Try pasting the page source from your browser, or add the application manually.',
    )
  }
}

export function isSameOriginRequest(request) {
  const host = String(request.headers.host || '').toLowerCase()
  const origin = request.headers.origin
  if (!host || typeof origin !== 'string') return false
  try {
    return new URL(origin).host.toLowerCase() === host
  } catch {
    return false
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let settled = false
    let size = 0
    const chunks = []
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      error ? reject(error) : resolve(value)
    }
    const timer = setTimeout(
      () => finish(new ServiceError(408, 'The request body timed out.')),
      5000,
    )
    request.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        request.resume()
        finish(
          new ServiceError(
            413,
            'The import upload is too large. Paste only the job posting section or add the application manually.',
          ),
        )
      } else chunks.push(chunk)
    })
    request.on('end', () => {
      if (settled) return
      try {
        finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        finish(new ServiceError(400, 'Send a valid JSON request.'))
      }
    })
    request.on('error', () => finish(new ServiceError(400, 'The request body could not be read.')))
  })
}

function sendJson(response, status, value) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(value))
}

export function createJobIngestHandler({
  fetcher = fetchPublicHtml,
  now = Date.now,
  maxRequests = MAX_REQUESTS_PER_WINDOW,
  maxInFlight = MAX_IN_FLIGHT,
} = {}) {
  const recentRequests = new Map()
  let inFlight = 0
  return (request, response) => {
    const fail = (status, message) => sendJson(response, status, { error: message })
    if (request.method !== 'POST') return fail(405, 'Use POST to import a job URL.')
    if (!isSameOriginRequest(request))
      return fail(403, 'This endpoint only accepts same-origin requests.')
    if (
      !String(request.headers['content-type'] || '')
        .toLowerCase()
        .startsWith('application/json')
    )
      return fail(415, 'Send the job URL as JSON.')
    if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
      request.resume()
      return fail(
        413,
        'The import upload is too large. Paste only the job posting section or add the application manually.',
      )
    }

    const client = request.socket.remoteAddress || 'unknown'
    const timestamp = now()
    const clientRequests = (recentRequests.get(client) || []).filter(
      (time) => timestamp - time < RATE_WINDOW_MS,
    )
    if (clientRequests.length >= maxRequests)
      return fail(429, 'Too many job imports. Please wait a minute and try again.')
    clientRequests.push(timestamp)
    recentRequests.set(client, clientRequests)
    if (recentRequests.size > 1000) {
      for (const [key, times] of recentRequests)
        if (!times.some((time) => timestamp - time < RATE_WINDOW_MS)) recentRequests.delete(key)
    }
    if (inFlight >= maxInFlight) return fail(429, 'The job importer is busy. Try again shortly.')

    inFlight += 1
    readJsonBody(request)
      .then(async (body) => {
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => !['url', 'html'].includes(key)) ||
          (body.html !== undefined && (typeof body.html !== 'string' || !body.html.trim())) ||
          typeof body.url !== 'string'
        )
          throw new ServiceError(400, 'Send one job URL.')
        parseTargetUrl(body.url)
        let html
        try {
          html = body.html === undefined ? await fetcher(body.url) : body.html
        } catch (error) {
          if (error instanceof ServiceError) throw error
          throw new ServiceError(
            502,
            'We couldn’t connect to this job site. Try again, paste the page source, or add the application manually.',
          )
        }
        const application = parseJobPostingHtml(html, body.url)
        sendJson(response, 200, { application })
      })
      .catch((error) => {
        fail(
          error instanceof ServiceError ? error.status : 502,
          error instanceof ServiceError ? error.message : 'Unable to import this job posting.',
        )
      })
      .finally(() => {
        inFlight -= 1
      })
  }
}
