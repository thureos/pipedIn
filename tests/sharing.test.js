import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeApplicationShare, decodeApplicationShare } from '../src/services/sharing.js'
import {
  extractJobPosting,
  isHtmlPageSource,
  jobPostingSourceUrl,
} from '../src/services/jobPosting.js'

test('pasted HTML source is recognized and its canonical posting URL is resolved', () => {
  const source = `<!doctype html>
    <html><head>
      <link href="https://jobs.example.test/role?source=page&amp;ref=1" rel="canonical">
      <script type="application/ld+json">
        {"@type":"JobPosting","title":"Engineer","url":"https://jobs.example.test/role"}
      </script>
    </head><body></body></html>`
  assert.equal(isHtmlPageSource(source), true)
  assert.equal(jobPostingSourceUrl(source), 'https://jobs.example.test/role?source=page&ref=1')
  assert.equal(isHtmlPageSource('export default function App() {}'), false)
  assert.equal(jobPostingSourceUrl('<html><body>No page URL</body></html>'), '')
})

test('application share uses Base64 JSON and preserves Unicode fields', () => {
  const application = { company: 'Café 一', title: 'Designer', notes: 'A thoughtful role' }
  const encoded = encodeApplicationShare(application)
  assert.match(encoded, /^[A-Za-z0-9+/]+=*$/)
  assert.deepEqual(decodeApplicationShare(encoded), application)
  assert.deepEqual(
    decodeApplicationShare(`https://example.test/?share=${encodeURIComponent(encoded)}`),
    application,
  )
  assert.throws(() => decodeApplicationShare('not an application share'), /valid Base64/)
  assert.throws(
    () => decodeApplicationShare('const application = { company: "Example" }'),
    /source code, not a Base64 application share/,
  )

  const sourceCode = 'export default function App() { return "Example" }'
  const sourceCodeBytes = new TextEncoder().encode(sourceCode)
  let binary = ''
  for (const byte of sourceCodeBytes) binary += String.fromCharCode(byte)
  assert.throws(
    () => decodeApplicationShare(btoa(binary)),
    /source code, not a Base64 application share/,
  )
})

test('JobPosting extraction maps organization, role, location and annual salary', () => {
  const posting = extractJobPosting(
    {
      '@graph': [
        { '@type': 'Organization', name: 'Example' },
        {
          '@type': 'JobPosting',
          title: 'Senior Engineer',
          hiringOrganization: { name: 'Café Labs' },
          jobLocation: { address: { addressLocality: 'Austin', addressRegion: 'TX' } },
          jobLocationType: 'TELECOMMUTE',
          employmentType: 'FULL_TIME',
          industry: 'Software',
          baseSalary: {
            currency: 'USD',
            value: { minValue: 125000, maxValue: 175000, unitText: 'YEAR' },
          },
          description: '<p>Build useful things.</p>',
          jobBenefits: ['Medical coverage', 'Flexible leave'],
        },
      ],
    },
    'https://jobs.example.test/role',
  )
  assert.deepEqual(posting, {
    company: 'Café Labs',
    title: 'Senior Engineer',
    location: 'Austin, TX',
    business: 'Software',
    workplace: 'Remote',
    employmentType: 'Full-time',
    url: 'https://jobs.example.test/role',
    notes: 'Build useful things.',
    perks: ['Medical coverage', 'Flexible leave'],
    salaryMinimumK: 125,
    salaryMaximumK: 175,
  })
  const scalarSalary = extractJobPosting(
    {
      '@type': 'JobPosting',
      title: 'Engineer',
      hiringOrganization: { name: 'Example' },
      baseSalary: { currency: 'USD', value: 145000 },
    },
    'https://jobs.example.test/scalar',
  )
  assert.equal(scalarSalary.salaryMinimumK, 145)
  assert.equal(scalarSalary.salaryMaximumK, 145)
  assert.equal(
    extractJobPosting(
      { '@type': 'JobPosting', title: 'Engineer' },
      'https://jobs.example.test/role',
    ).company,
    '',
  )
  assert.throws(
    () =>
      extractJobPosting(
        { '@type': 'JobPosting', hiringOrganization: { name: 'Example' } },
        'https://jobs.example.test/role',
      ),
    /job title/,
  )
  assert.throws(
    () => extractJobPosting({}, 'https://jobs.example.test/role'),
    /No schema.org JobPosting/,
  )
})
