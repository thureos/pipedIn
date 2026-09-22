import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applicationsCsv } from '../src/export.js'
import { blankApplication, stages } from '../src/data.js'

test('CSV lists every application with its human-readable current status', () => {
  const csv = applicationsCsv(stages.map(stage => ({ ...blankApplication(), company: 'Example', stage: stage.id })))
  assert.ok(csv.startsWith('\uFEFF'))
  assert.equal(csv.trim().split('\r\n').length, stages.length + 1)
  for (const stage of stages) assert.ok(csv.includes(`"${stage.name}"`))
  assert.ok(csv.includes('"Current status"'))
})

test('CSV preserves commas, quotes, Unicode and multiline text, and escapes spreadsheet formulas', () => {
  const csv = applicationsCsv([{ ...blankApplication(), company: 'Café, "Design"', title: '=1+1', location: 'New\nYork', salary: '  +SUM(A1)', stage: 'declined', reasons: { declined: 'Timing, compensation' } }])
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
  const csv = applicationsCsv([{ ...blankApplication(), color: 'blue', starred: true }, blankApplication()])
  const lines = csv.trim().split('\r\n')
  assert.ok(lines[0].endsWith('"Card color","Starred"'))
  assert.ok(lines[1].endsWith('"blue","Yes"'))
  assert.ok(lines[2].endsWith('"","No"'))
})
