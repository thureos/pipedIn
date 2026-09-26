import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fetchPublicHtml,
  isPublicAddress,
  isSameOriginRequest,
  parseJobPostingHtml,
  parseTargetUrl,
  resolvePublicAddresses,
  createJobIngestHandler,
} from '../server/job-ingest.js'
import { createAppServer } from '../server/index.js'
import { extractJobPosting } from '../src/services/jobPosting.js'

test('public address check rejects private, reserved, mapped and link-local IPs', () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.51.100.5',
    '203.0.113.9',
    '224.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2002::1',
  ])
    assert.equal(isPublicAddress(address), false, address)
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
})

test('target URL validation rejects non-web, credentialed, nonstandard-port and private targets', () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com/job',
    'http://user:pass@example.com/job',
    'https://example.com:8443/job',
    'http://127.0.0.1/admin',
    'http://metadata.google.internal/',
  ])
    assert.throws(() => parseTargetUrl(url))
  assert.equal(parseTargetUrl('https://jobs.example.com/role').hostname, 'jobs.example.com')
})

test('DNS answers with any private address are rejected', async () => {
  await assert.rejects(
    resolvePublicAddresses('jobs.example.test', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ]),
    /private or reserved/,
  )
  const addresses = await resolvePublicAddresses('jobs.example.test', async () => [
    { address: '93.184.216.34', family: 4 },
  ])
  assert.equal(addresses[0].address, '93.184.216.34')
})

test('each redirect is revalidated before any follow-up request', async () => {
  let requestCount = 0
  await assert.rejects(
    fetchPublicHtml('https://jobs.example.test/role', {
      resolver: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => {
        requestCount += 1
        return { status: 302, location: 'http://127.0.0.1/admin' }
      },
    }),
    /Private or reserved/,
  )
  assert.equal(requestCount, 1)
})

test('expired total fetch deadlines stop before DNS or HTTP work', async () => {
  await assert.rejects(
    fetchPublicHtml('https://jobs.example.test/role', {}, 0, Date.now() - 1),
    /timed out/,
  )
})

test('HTML parser returns only extracted JobPosting fields', () => {
  const jsonLd = {
    '@type': 'JobPosting',
    title: 'Designer',
    hiringOrganization: { name: 'Example' },
    jobLocationType: 'TELECOMMUTE',
  }
  const html = `<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`
  assert.deepEqual(parseJobPostingHtml(html, 'https://jobs.example.test/role'), {
    company: 'Example',
    title: 'Designer',
    location: '',
    business: '',
    workplace: 'Remote',
    employmentType: '',
    url: 'https://jobs.example.test/role',
    notes: '',
    perks: [],
    salaryMinimumK: null,
    salaryMaximumK: null,
  })
  assert.throws(
    () => parseJobPostingHtml('<html>no data</html>', 'https://jobs.example.test/role'),
    /No complete schema/,
  )
})

test('extracted text and benefit arrays have strict output bounds', () => {
  const posting = extractJobPosting(
    {
      '@type': 'JobPosting',
      title: 't'.repeat(500),
      hiringOrganization: { name: 'c'.repeat(500) },
      description: 'd'.repeat(9000),
      jobBenefits: Array.from({ length: 30 }, () => 'b'.repeat(200)),
    },
    'https://jobs.example.test/role',
  )
  assert.equal(posting.company.length, 150)
  assert.equal(posting.title.length, 200)
  assert.equal(posting.notes.length, 5000)
  assert.equal(posting.perks.length, 20)
  assert.equal(posting.perks[0].length, 120)
})

test('deeply nested JSON-LD does not recurse without bounds', () => {
  let nested = {}
  for (let depth = 0; depth < 1000; depth += 1) nested = { nested }
  assert.throws(
    () => extractJobPosting(nested, 'https://jobs.example.test/role'),
    /No schema.org JobPosting/,
  )
})

test('same-origin middleware rejects foreign or missing Origin headers', () => {
  assert.equal(
    isSameOriginRequest({ headers: { host: 'app.example', origin: 'https://app.example' } }),
    true,
  )
  assert.equal(
    isSameOriginRequest({ headers: { host: 'app.example', origin: 'https://attacker.example' } }),
    false,
  )
  assert.equal(isSameOriginRequest({ headers: { host: 'app.example' } }), false)
})

test('endpoint enforces origin, body shape and request rate, and returns extracted fields', async (t) => {
  const job = { '@type': 'JobPosting', title: 'Engineer', hiringOrganization: { name: 'Example' } }
  const server = createServer(
    createJobIngestHandler({
      fetcher: async () => `<script type="application/ld+json">${JSON.stringify(job)}</script>`,
      maxRequests: 2,
    }),
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}`
  const send = (body, origin = base) =>
    fetch(`${base}/api/job-posting`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal(
    (await send({ url: 'https://jobs.example.test/role' }, 'https://attacker.example')).status,
    403,
  )
  assert.equal(
    (
      await fetch(`${base}/api/job-posting`, {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'x'.repeat(5000) }),
      })
    ).status,
    413,
  )
  const success = await send({ url: 'https://jobs.example.test/role' })
  assert.equal(success.status, 200)
  assert.equal(success.headers.get('access-control-allow-origin'), null)
  assert.deepEqual((await success.json()).application, {
    company: 'Example',
    title: 'Engineer',
    location: '',
    business: '',
    workplace: 'Onsite',
    employmentType: '',
    url: 'https://jobs.example.test/role',
    notes: '',
    perks: [],
    salaryMinimumK: null,
    salaryMaximumK: null,
  })
  assert.equal((await send({ url: 'https://jobs.example.test/role', extra: true })).status, 400)
  assert.equal((await send({ url: 'https://jobs.example.test/role' })).status, 429)
})

test('production server serves the SPA and runtime config while blocking traversal paths', async (t) => {
  const distDirectory = await mkdtemp(join(tmpdir(), 'pipedin-dist-'))
  await writeFile(join(distDirectory, 'index.html'), '<main>app</main>')
  await mkdir(join(distDirectory, 'assets'))
  await writeFile(join(distDirectory, 'assets', 'app.js'), 'window.loaded = true')
  const server = createAppServer({
    distDirectory,
    environment: { VITE_GOOGLE_CLIENT_ID: 'client-id' },
    ingestHandler: (_request, response) => {
      response.statusCode = 202
      response.end('api')
    },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.close()
    await rm(distDirectory, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal(await (await fetch(`${base}/pipeline`)).text(), '<main>app</main>')
  const asset = await fetch(`${base}/assets/app.js`)
  assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(
    (await (await fetch(`${base}/runtime-config.js`)).text()).includes('client-id'),
    true,
  )
  assert.equal((await fetch(`${base}/api/job-posting`, { method: 'POST' })).status, 202)
  assert.equal((await fetch(`${base}/%2e%2e%2fsecret.txt`)).status, 404)
})
