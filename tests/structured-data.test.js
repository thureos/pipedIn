import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib'
import { parseJobPostingHtml, readHtmlResponse } from '../server/job-ingest.js'
import { extractJobPosting } from '../src/services/jobPosting.js'

const url = 'https://jobs.example.com/role?source=LinkedIn'
const job = { '@type': 'JobPosting', title: 'Engineer', hiringOrganization: { name: 'Example' } }
const script = (value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`

test('HTML script parsing tolerates attribute case, quoting, whitespace and MIME parameters', () => {
  for (const attributes of [
    'TYPE=application/ld+json',
    "type=' APPLICATION/LD+JSON ; charset=utf-8 ' data-label='a > b'",
    'data-label="a > b" type="application/ld+json"',
  ]) {
    assert.equal(
      parseJobPostingHtml(`<SCRIPT ${attributes}>${JSON.stringify(job)}</SCRIPT>`, url).title,
      'Engineer',
    )
  }
})

test('malformed, unrelated and incomplete blocks do not hide a later usable posting', () => {
  const html =
    '<script type="application/ld+json">{broken</script>' +
    script({ '@type': 'Organization', name: 'Site owner' }) +
    script({ '@type': 'JobPosting', hiringOrganization: { name: 'Incomplete' } }) +
    script(job)
  assert.equal(parseJobPostingHtml(html, url).company, 'Example')
  assert.throws(
    () => parseJobPostingHtml(script({ '@type': 'JobPosting' }), url),
    /required job title/,
  )
})

test('commented-out markup and script-like strings are not treated as actual schema scripts', () => {
  assert.throws(() => parseJobPostingHtml(`<!-- ${script(job)} -->`, url), /No complete schema/)
  assert.throws(
    () => parseJobPostingHtml(`<script>const x = '${script(job)}'</script>`, url),
    /No complete schema/,
  )
})

test('common JSON-LD wrappers and incorrectly entity-escaped JSON are tolerated', () => {
  for (const text of [
    `\uFEFF${JSON.stringify(job)}`,
    `<!--${JSON.stringify(job)}-->`,
    `<![CDATA[${JSON.stringify(job)}]]>`,
    JSON.stringify(job).replaceAll('"', '&quot;'),
  ])
    assert.equal(
      parseJobPostingHtml(`<script type="application/ld+json">${text}</script>`, url).title,
      'Engineer',
    )
})

test('graphs resolve organization and location references across scripts and support schema URLs', () => {
  const html =
    script({
      '@graph': [
        {
          ...job,
          '@type': ['Thing', 'https://schema.org/JobPosting'],
          hiringOrganization: { '@id': '#company' },
          jobLocation: { '@id': '#office' },
        },
      ],
    }) +
    script([
      { '@id': '#company', name: 'Research &amp; Development' },
      { '@id': '#office', address: { addressLocality: 'Austin', postalCode: 78701 } },
    ])
  const result = parseJobPostingHtml(html, url)
  assert.equal(result.company, 'Research & Development')
  assert.equal(result.location, 'Austin, 78701')
})

test('matching posting URL wins over unrelated jobs and incomplete candidates', () => {
  const result = extractJobPosting(
    [
      { ...job, title: 'Other', url: 'https://jobs.example.com/other' },
      { ...job, title: 'Matched', url: 'https://jobs.example.com/role' },
    ],
    url,
  )
  assert.equal(result.title, 'Matched')
})

test('microdata reads nested organizations, addresses, salary, repeated benefits and itemref', () => {
  const html = `<article itemscope itemtype="https://schema.org/JobPosting" itemref="benefits">
    <h1 itemprop="title">Principal Engineer</h1>
    <div itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization"><span itemprop="name">Example &amp; Co</span></div>
    <div itemprop="jobLocation" itemscope itemtype="https://schema.org/Place"><div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress"><meta itemprop="addressLocality" content="Austin"></div></div>
    <meta itemprop="employmentType" content="FULL_TIME">
    <div itemprop="baseSalary" itemscope><meta itemprop="currency" content="USD"><div itemprop="value" itemscope><meta itemprop="minValue" content="100000"><meta itemprop="maxValue" content="150000"><meta itemprop="unitText" content="YEAR"></div></div>
    <p itemprop="description">Build <strong>useful</strong> things.</p>
    </article><aside id="benefits"><span itemprop="jobBenefits">Medical</span><span itemprop="jobBenefits">Dental</span></aside>`
  const result = parseJobPostingHtml(html, url)
  assert.equal(result.company, 'Example & Co')
  assert.equal(result.title, 'Principal Engineer')
  assert.equal(result.location, 'Austin')
  assert.equal(result.notes, 'Build useful things.')
  assert.equal(result.salaryMinimumK, 100)
  assert.equal(result.salaryMaximumK, 150)
  assert.deepEqual(result.perks, ['Medical', 'Dental'])
})

test('malformed salary values never become zero or block an otherwise usable draft', () => {
  for (const value of [
    null,
    '',
    false,
    { minValue: null, maxValue: '' },
    { minValue: 200000, maxValue: 100000 },
  ]) {
    const result = extractJobPosting({ ...job, baseSalary: { currency: 'USD', value } }, url)
    assert.ok(result.salaryMinimumK == null)
    assert.ok(result.salaryMaximumK == null)
  }
  assert.deepEqual(
    extractJobPosting({ ...job, baseSalary: { value: '150000' } }, url).salaryMinimumK,
    150,
  )
})

test('text entities are decoded and organization arrays and language values are supported', () => {
  const result = extractJobPosting(
    {
      ...job,
      title: { '@value': 'R&D Engineer' },
      hiringOrganization: [{ name: ' ' }, { name: 'Example &amp; Co' }],
      description: '<p>It&rsquo;s&nbsp;good.</p>',
    },
    url,
  )
  assert.equal(result.company, 'Example & Co')
  assert.equal(result.notes, 'It’s good.')
})

test('cyclic graph references and microdata references terminate', () => {
  const result = parseJobPostingHtml(
    script([
      { ...job, hiringOrganization: { '@id': '#company' } },
      { '@id': '#company', name: 'Example', parent: { '@id': '#company' } },
    ]),
    url,
  )
  assert.equal(result.company, 'Example')
  assert.equal(
    parseJobPostingHtml(
      '<div id="job" itemscope itemtype="https://schema.org/JobPosting" itemref="job"><span itemprop="title">Engineer</span></div>',
      url,
    ).title,
    'Engineer',
  )
})

function response(body, encoding) {
  const stream = Readable.from([body])
  stream.headers = encoding ? { 'content-encoding': encoding } : {}
  return stream
}

test('HTML bodies accept identity, gzip, deflate and Brotli', async () => {
  const html = script(job)
  for (const [encoding, compress] of [
    ['identity', Buffer.from],
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ])
    assert.equal(await readHtmlResponse(response(compress(html), encoding)), html)
})

test('response limits apply to decoded bytes and invalid compression fails', async () => {
  await assert.rejects(
    readHtmlResponse(response(gzipSync('x'.repeat(1048577)), 'gzip')),
    /too large/,
  )
  await assert.rejects(readHtmlResponse(response(Buffer.from('not gzip'), 'gzip')))
  await assert.rejects(
    readHtmlResponse(response(Buffer.from('x'), 'unknown')),
    /unsupported compression/,
  )
})
