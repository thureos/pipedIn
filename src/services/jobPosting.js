import { decodeHTML } from 'entities'
import { employmentTypes, isApplicationUrl } from '../domain/applications.js'

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function findJobPosting(value, sourceUrl) {
  const pending = [{ value, depth: 0 }]
  const nodes = []
  const seen = new Set()
  while (pending.length && nodes.length < 10000) {
    const current = pending.pop()
    if (
      !current.value ||
      typeof current.value !== 'object' ||
      current.depth > 32 ||
      seen.has(current.value)
    )
      continue
    seen.add(current.value)
    nodes.push(current.value)
    const children = Object.values(current.value)
    for (let i = children.length - 1; i >= 0; i -= 1)
      if (children[i] && typeof children[i] === 'object')
        pending.push({ value: children[i], depth: current.depth + 1 })
  }
  const refs = new Map()
  const absoluteId = (id) => {
    try {
      return new URL(id, sourceUrl).href
    } catch {
      return id
    }
  }
  for (const node of nodes)
    if (typeof node['@id'] === 'string' && Object.keys(node).length > 1)
      refs.set(absoluteId(node['@id']), node)
  let resolved = 0
  function resolve(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value) || resolved++ >= 20000)
      return null
    const nextSeen = new Set(seen).add(value)
    if (Array.isArray(value))
      return value
        .slice(0, 100)
        .map((entry) =>
          entry && typeof entry === 'object' ? resolve(entry, depth + 1, nextSeen) : entry,
        )
    const reference = typeof value['@id'] === 'string' ? refs.get(absoluteId(value['@id'])) : null
    const merged = reference ? { ...reference, ...value } : value
    return Object.fromEntries(
      Object.entries(merged).map(([key, entry]) => [
        key,
        entry && typeof entry === 'object' ? resolve(entry, depth + 1, nextSeen) : entry,
      ]),
    )
  }
  const jobs = nodes.filter((node) =>
    asArray(node['@type']).some(
      (type) =>
        typeof type === 'string' && /^(?:https?:\/\/schema\.org\/)?JobPosting\/?$/.test(type),
    ),
  )
  if (!jobs.length) return null
  const normalizeUrl = (value) => {
    try {
      const url = new URL(value, sourceUrl)
      return url.origin + url.pathname.replace(/\/$/, '')
    } catch {
      return ''
    }
  }
  const candidates = jobs.map((job) => resolve(job)).filter((job) => plainText(job?.title, 200))
  if (!candidates.length) throw new Error('The JobPosting is missing required job title.')
  const score = (job) =>
    (asArray(job.url).some(
      (url) => typeof url === 'string' && normalizeUrl(url) === normalizeUrl(sourceUrl),
    )
      ? 100
      : 0) +
    (organizationName(job.hiringOrganization) ? 10 : 0) +
    (plainText(job.description) ? 1 : 0)
  return candidates.sort((a, b) => score(b) - score(a))[0]
}

function organizationName(value) {
  return (
    asArray(value)
      .map((entry) => plainText(typeof entry === 'string' ? entry : entry?.name, 150))
      .find(Boolean) || ''
  )
}

function plainText(value, limit = 500) {
  if (value && typeof value === 'object') value = value['@value']
  return typeof value === 'string'
    ? decodeHTML(
        value
          .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
          .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
          .replace(/<[^>]*>/g, ' '),
      )
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
        .map((value) => (typeof value === 'number' ? String(value) : plainText(value)))
        .filter(Boolean)
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
    (typeof amount === 'number' || (typeof amount === 'string' && amount.trim() !== '')) &&
    Number.isFinite(Number(amount)) &&
    Number(amount) >= 0
      ? Math.round(Number(amount) / 100) / 10
      : null
  const amount = ['number', 'string'].includes(typeof value) ? value : value?.value
  const minimum = toThousands(value?.minValue ?? amount)
  const maximum = toThousands(value?.maxValue ?? amount)
  if (minimum !== null && maximum !== null && minimum > maximum) return {}
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
  const job = findJobPosting(jsonLd, sourceUrl)
  if (!job) throw new Error('No schema.org JobPosting was found at this URL.')
  const company = organizationName(job.hiringOrganization)
  const title = plainText(job.title, 200)
  if (!title) throw new Error('The JobPosting is missing required job title.')
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
