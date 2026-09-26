import { employmentTypes, isApplicationUrl } from '../domain/applications.js'

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function findJobPosting(value) {
  const pending = [{ value, depth: 0 }]
  let scanned = 0
  while (pending.length && scanned < 10000) {
    const current = pending.pop()
    if (!current.value || typeof current.value !== 'object' || current.depth > 32) continue
    scanned += 1
    if (!Array.isArray(current.value) && asArray(current.value['@type']).includes('JobPosting'))
      return current.value
    for (const child of Object.values(current.value)) {
      if (child && typeof child === 'object')
        pending.push({ value: child, depth: current.depth + 1 })
    }
  }
  return null
}

function plainText(value, limit = 500) {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit)
    : ''
}

function locationText(jobLocation) {
  return asArray(jobLocation)
    .map((location) => {
      const address = location?.address || location
      return [
        address?.addressLocality,
        address?.addressRegion,
        address?.postalCode,
        address?.addressCountry?.name || address?.addressCountry,
      ]
        .filter((value) => typeof value === 'string' && value.trim())
        .join(', ')
    })
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500)
}

function salaryRange(baseSalary) {
  const value = baseSalary?.value ?? baseSalary
  const unit = String(value?.unitText || '').toUpperCase()
  const currency = String(baseSalary?.currency || '').toUpperCase()
  if ((unit && !['YEAR', 'YEARLY', 'PER_YEAR'].includes(unit)) || (currency && currency !== 'USD'))
    return {}
  const toThousands = (amount) =>
    Number.isFinite(Number(amount)) && Number(amount) >= 0
      ? Math.round(Number(amount) / 100) / 10
      : null
  const amount = typeof value === 'number' ? value : value?.value
  const minimum = toThousands(value?.minValue ?? amount)
  const maximum = toThousands(value?.maxValue ?? amount)
  return { salaryMinimumK: minimum, salaryMaximumK: maximum }
}

function employmentType(value) {
  const normalized = String(asArray(value)[0] || '')
    .toUpperCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
  const known = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    CONTRACTOR: 'Contract',
    CONTRACT: 'Contract',
    TEMPORARY: 'Temporary',
    INTERN: 'Internship',
    INTERN_SHIP: 'Internship',
    FREELANCE: 'Freelance',
  }
  return known[normalized] || (employmentTypes.includes(value) ? value : '')
}

export function extractJobPosting(jsonLd, sourceUrl) {
  const job = findJobPosting(jsonLd)
  if (!job) throw new Error('No schema.org JobPosting was found at this URL.')
  const company = plainText(job.hiringOrganization?.name, 150)
  const title = plainText(job.title, 200)
  const missing = [!company && 'hiring organization', !title && 'job title'].filter(Boolean)
  if (missing.length)
    throw new Error(`The JobPosting is missing required ${missing.join(' and ')}.`)
  if (!isApplicationUrl(sourceUrl)) throw new Error('Enter a valid http or https job posting URL.')
  const remote = asArray(job.jobLocationType).some(
    (type) => String(type).toUpperCase() === 'TELECOMMUTE',
  )
  const workplace = remote
    ? 'Remote'
    : /hybrid/i.test(String(job.jobLocationType || ''))
      ? 'Hybrid'
      : 'Onsite'
  return {
    company,
    title,
    location: locationText(job.jobLocation),
    business: plainText(job.industry, 200),
    workplace,
    employmentType: employmentType(job.employmentType),
    url: new URL(sourceUrl).href,
    notes: plainText(job.description, 5000),
    perks: asArray(job.jobBenefits)
      .slice(0, 20)
      .map((value) => plainText(value, 120))
      .filter(Boolean),
    ...salaryRange(job.baseSalary),
  }
}

export async function fetchJobPosting(url) {
  let response
  try {
    response = await fetch('/api/job-posting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw new Error('The job import service is unavailable. Try again later.')
  }
  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('The job import service returned an invalid response.')
  }
  if (!response.ok) throw new Error(result.error || 'Unable to import this job posting.')
  return result.application
}
