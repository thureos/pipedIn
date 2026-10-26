import test from 'node:test'
import assert from 'node:assert/strict'
import { workSearchWeeks } from '../src/utils/workSearch.js'

test('weeks run Sunday through Saturday and retain every application', () => {
  const applications = Array.from({ length: 9 }, (_, id) => ({ id, date: '2026-10-25' }))
  applications.push(
    { id: 10, date: '2026-10-31' },
    { id: 11, date: '2026-11-01' },
    { id: 12, date: '2026-10-24' },
  )
  const weeks = workSearchWeeks(applications, '2026-10-28', 2)
  assert.equal(weeks[0].start, '2026-10-25')
  assert.equal(weeks[0].applications.length, 10)
  assert.equal(weeks[1].start, '2026-11-01')
  assert.deepEqual(
    weeks[1].applications.map((a) => a.id),
    [11],
  )
})

test('Sunday stays Sunday, including year boundaries', () => {
  assert.equal(workSearchWeeks([], '2027-01-01')[0].start, '2026-12-27')
  assert.equal(workSearchWeeks([], '2026-10-25')[0].start, '2026-10-25')
  assert.throws(() => workSearchWeeks([], ''), /starting date/)
})

test('five-job pages repeat week metadata and preserve every job in order', async () => {
  const { paginateWorkSearchWeeks } = await import('../src/utils/workSearch.js')
  const rows = Array.from({ length: 12 }, (_, id) => ({ id }))
  const pages = paginateWorkSearchWeeks([
    { start: '2026-10-25', rows },
    { start: '2026-11-01', rows: rows.slice(0, 5) },
  ])
  assert.deepEqual(
    pages.map((page) => page.rows.length),
    [5, 5, 2, 5],
  )
  assert.deepEqual(
    pages.slice(0, 3).flatMap((page) => page.rows),
    rows,
  )
  assert.deepEqual(
    pages.map((page) => [page.weekNumber, page.pageNumber, page.pageCount]),
    [
      [1, 1, 3],
      [1, 2, 3],
      [1, 3, 3],
      [2, 1, 1],
    ],
  )
  assert.ok(pages.slice(0, 3).every((page) => page.start === '2026-10-25'))
})

test('potential jobs require a recorded Applied stage to appear in the log', () => {
  const applications = [
    { id: 'potential', stage: 'potential', date: '2026-10-26', stageHistory: [] },
    { id: 'legacy-potential', stage: 'potential', date: '2026-10-26' },
    {
      id: 'previously-applied',
      stage: 'potential',
      date: '2026-10-26',
      stageHistory: [{ stage: 'applied', enteredAt: '2026-10-26T12:00:00Z' }],
    },
    { id: 'applied', stage: 'applied', date: '2026-10-26' },
    { id: 'interview', stage: 'interviews', date: '2026-10-26' },
  ]
  assert.deepEqual(
    workSearchWeeks(applications, '2026-10-25')[0].applications.map((a) => a.id),
    ['previously-applied', 'applied', 'interview'],
  )
})
