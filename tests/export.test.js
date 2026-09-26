import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applicationsCsv } from '../src/utils/export.js'
import { blankApplication, stages } from '../src/domain/applications.js'

test('CSV lists every application with its human-readable current status', () => {
  const csv = applicationsCsv(
    stages.map((stage) => ({ ...blankApplication(), company: 'Example', stage: stage.id })),
  )
  assert.ok(csv.startsWith('\uFEFF'))
  assert.equal(csv.trim().split('\r\n').length, stages.length + 1)
  for (const stage of stages) assert.ok(csv.includes(`"${stage.name}"`))
  assert.ok(csv.includes('"Current status"'))
})

test('CSV preserves commas, quotes, Unicode and multiline text, and escapes spreadsheet formulas', () => {
  const csv = applicationsCsv([
    {
      ...blankApplication(),
      company: 'Café, "Design"',
      title: '=1+1',
      location: 'New\nYork',
      salary: '  +SUM(A1)',
      stage: 'declined',
      reasons: { declined: 'Timing, compensation' },
    },
  ])
  assert.ok(csv.includes('"Café, ""Design"""'))
  assert.ok(csv.includes('"\'=1+1"'))
  assert.ok(csv.includes('"\'  +SUM(A1)"'))
  assert.ok(csv.includes('"New\nYork"'))
  assert.ok(csv.includes('"Timing, compensation"'))
  assert.ok(!csv.includes('undefined'))
})

test('empty CSV still exports column headings', () => {
  assert.equal(applicationsCsv([]).trim().split('\r\n').length, 1)
})

test('CSV includes card colors and starred status', () => {
  const csv = applicationsCsv([
    { ...blankApplication(), color: 'blue', starred: true },
    blankApplication(),
  ])
  const lines = csv.trim().split('\r\n')
  assert.ok(
    lines[0].endsWith(
      '"Card color","Starred","Salary minimum (K)","Salary maximum (K)","Insurance coverage","Hiring channel"',
    ),
  )
  assert.ok(lines[1].endsWith('"blue","Yes","","","","direct"'))
  assert.ok(lines[2].endsWith('"","No","","","","direct"'))
})

test('CSV includes salary endpoints, insurance coverage and hiring channel', () => {
  const csv = applicationsCsv([
    {
      ...blankApplication(),
      salaryMinimumK: 50,
      salaryMaximumK: 90,
      insuranceCoverage: 'excellent',
      hiringChannel: 'recruiter',
    },
  ])
  assert.ok(
    csv.includes('"Salary minimum (K)","Salary maximum (K)","Insurance coverage","Hiring channel"'),
  )
  assert.ok(csv.includes('"$50K – $90K / year"'))
  assert.ok(csv.includes('"50","90","excellent","recruiter"'))
})
