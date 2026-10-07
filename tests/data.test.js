import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  blankApplication,
  validateApplications,
  demoApplications,
  stages,
  stampApplication,
  ageLabel,
  boardStages,
  columnForStage,
  endingOutcomes,
  salaryRangeLabel,
  reorderApplications,
} from '../src/domain/applications.js'
const application = () => ({ ...blankApplication(), company: 'Example', title: 'Engineer' })
test('terminal outcomes share one column without changing saved reasons or history', () => {
  assert.equal(boardStages.length, 6)
  assert.equal(boardStages.at(-1).id, 'ended')
  assert.equal(boardStages.at(-1).name, 'Completed')
  for (const outcome of endingOutcomes) {
    const item = stampApplication(
      { ...application(), stage: outcome.id },
      null,
      '2026-09-01T10:00:00.000Z',
    )
    item.reasons[outcome.id] = 'Existing reason'
    const [restored] = validateApplications(JSON.parse(JSON.stringify([item])))
    assert.equal(columnForStage(restored.stage), 'ended')
    assert.deepEqual(restored, item)
  }
  assert.equal(columnForStage('offer'), 'offer')
  assert.throws(() => validateApplications([{ ...application(), stage: 'ended' }]))
})
test('reorders applications within their visible column without changing records', () => {
  const first = { ...application(), id: 'first' }
  const unrelated = { ...application(), id: 'unrelated', stage: 'potential', url: '' }
  const second = { ...application(), id: 'second' }
  const declined = { ...application(), id: 'declined', stage: 'declined' }
  const accepted = { ...application(), id: 'accepted', stage: 'accepted' }
  const items = [first, unrelated, second, declined, accepted]
  const reordered = reorderApplications(items, 'second', 'first', 'before')
  assert.deepEqual(
    reordered.map((item) => item.id),
    ['second', 'unrelated', 'first', 'declined', 'accepted'],
  )
  assert.deepEqual(
    reorderApplications(items, 'declined', 'accepted', 'after').map((i) => i.id),
    ['first', 'unrelated', 'second', 'accepted', 'declined'],
  )
  assert.equal(reorderApplications(items, 'first', 'unrelated'), items)
  assert.deepEqual(reordered[2], first)
})
test('valid backup preserves interview ratings, outcome reasons and custom fields', () => {
  const item = application()
  item.attributes.push({ name: 'Recruiter', value: 'Alex' })
  item.perks.push('Learning budget')
  item.reasons.declined = 'Accepted another offer'
  item.interviews.push({
    id: 'round-1',
    name: 'Technical',
    person: 'Alex',
    date: '2026-09-21',
    notes: 'Good conversation',
    rating: 5,
  })
  const restored = validateApplications(JSON.parse(JSON.stringify([item])))
  assert.deepEqual(restored, [item])
  assert.notEqual(restored[0], item)
})
test('rejects damaged data before replacing stored applications', () => {
  for (const change of [
    { stage: 'unknown' },
    { perks: [null] },
    { attributes: [{}] },
    { interviews: [{ rating: 9 }] },
    { reasons: null },
    { title: 7 },
    { workplace: 'invalid' },
  ])
    assert.throws(() => validateApplications([{ ...application(), ...change }]))
  const item = application()
  assert.throws(() => validateApplications([item, item]))
  assert.throws(() => validateApplications({ applications: [] }))
})
test('sample data can be backed up and every requested stage is available', () => {
  assert.equal(validateApplications(demoApplications()).length, 8)
  assert.equal(stages.length, 9)
  assert.deepEqual(validateApplications([]), [])
})
test('timestamps preserve creation and stage age on edits, and track repeat stage visits', () => {
  const first = stampApplication(application(), null, '2026-09-01T10:00:00.000Z')
  const edit = stampApplication({ ...first, notes: 'Updated' }, first, '2026-09-02T10:00:00.000Z')
  assert.equal(edit.createdAt, first.createdAt)
  assert.equal(edit.stageEnteredAt, first.stageEnteredAt)
  assert.equal(edit.stageHistory.length, 1)
  assert.notEqual(edit.updatedAt, first.updatedAt)
  const moved = stampApplication({ ...edit, stage: 'interviews' }, edit, '2026-09-03T10:00:00.000Z')
  const returned = stampApplication(
    { ...moved, stage: 'applied' },
    moved,
    '2026-09-04T10:00:00.000Z',
  )
  assert.equal(returned.stageHistory.length, 3)
  assert.equal(returned.stageEnteredAt, '2026-09-04T10:00:00.000Z')
  assert.deepEqual(validateApplications([returned]), [returned])
})
test('legacy backups retain data without inventing stage timestamps', () => {
  const old = application()
  for (const key of ['createdAt', 'updatedAt', 'stageEnteredAt', 'stageHistory']) delete old[key]
  const [restored] = validateApplications([old])
  assert.equal(restored.company, old.company)
  assert.equal(restored.createdAt, null)
  assert.equal(restored.stageEnteredAt, null)
  assert.deepEqual(restored.stageHistory, [])
  assert.throws(() => validateApplications([{ ...restored, updatedAt: 'invalid' }]))
})
test('potential applications need a name and safe link, but no job title', () => {
  const potential = {
    ...blankApplication(),
    company: 'Interesting opportunity',
    stage: 'potential',
    url: 'https://example.com/job',
  }
  assert.equal(validateApplications([potential])[0].title, '')
  assert.equal(validateApplications([{ ...potential, url: '' }])[0].url, '')
  for (const url of ['javascript:alert(1)', 'not a url'])
    assert.throws(() => validateApplications([{ ...potential, url }]))
  assert.throws(() => validateApplications([{ ...potential, stage: 'applied' }]))
})
test('age labels cover minutes, hours, days, unknown and future timestamps', () => {
  const now = Date.parse('2026-09-21T12:00:00Z')
  assert.equal(ageLabel(null, now), 'Age unknown')
  assert.equal(ageLabel('2026-09-21T11:58:00Z', now), '2m')
  assert.equal(ageLabel('2026-09-21T10:00:00Z', now), '2h')
  assert.equal(ageLabel('2026-09-01T12:00:00Z', now), '20d')
  assert.equal(ageLabel('2026-09-22T12:00:00Z', now), 'Just now')
})

test('employment types survive backups and older records remain compatible', () => {
  const item = { ...application(), employmentType: 'Contract' }
  assert.equal(validateApplications([item])[0].employmentType, 'Contract')
  delete item.employmentType
  assert.equal(validateApplications([item])[0].employmentType, '')
  assert.throws(() => validateApplications([{ ...item, employmentType: 'invalid' }]))
  assert.throws(() => validateApplications([{ ...item, employmentType: null }]))
})

test('salary range, insurance coverage and hiring channel validate and survive legacy backups', () => {
  const item = {
    ...application(),
    salaryMinimumK: 50,
    salaryMaximumK: 90,
    insuranceCoverage: 'excellent',
    hiringChannel: 'recruiter',
  }
  assert.deepEqual(validateApplications([item]), [item])
  assert.equal(salaryRangeLabel(item), '$50K – $90K / year')
  assert.equal(
    salaryRangeLabel({ ...item, salaryMinimumK: 65, salaryMaximumK: null }),
    '$65K / year',
  )
  assert.equal(
    salaryRangeLabel({ ...item, salaryMinimumK: null, salaryMaximumK: null, salary: '$70k–$90k' }),
    '$70k–$90k',
  )
  const legacy = { ...application(), salary: '$70k–$90k' }
  delete legacy.salaryMinimumK
  delete legacy.salaryMaximumK
  delete legacy.insuranceCoverage
  delete legacy.hiringChannel
  assert.equal(validateApplications([legacy])[0].hiringChannel, 'direct')
  assert.equal(validateApplications([legacy])[0].insuranceCoverage, '')
  for (const change of [
    { salaryMinimumK: 100, salaryMaximumK: 90 },
    { salaryMinimumK: -1 },
    { salaryMaximumK: '90' },
    { insuranceCoverage: 'great' },
    { hiringChannel: 'agency' },
  ])
    assert.throws(() => validateApplications([{ ...item, ...change }]))
})

test('card colors and stars survive backup, edits, and stage changes', () => {
  for (const color of ['blue', 'orange', 'yellow', 'green']) {
    const first = stampApplication(
      { ...application(), color, starred: true },
      null,
      '2026-09-01T10:00:00.000Z',
    )
    const edited = stampApplication({ ...first, starred: false }, first, '2026-09-02T10:00:00.000Z')
    assert.equal(edited.stageEnteredAt, first.stageEnteredAt)
    assert.deepEqual(edited.stageHistory, first.stageHistory)
    const moved = stampApplication({ ...first, stage: 'interviews' }, first)
    const [restored] = validateApplications(JSON.parse(JSON.stringify([moved])))
    assert.equal(restored.color, color)
    assert.equal(restored.starred, true)
    assert.equal(validateApplications([edited])[0].starred, false)
  }
  const old = application()
  delete old.color
  delete old.starred
  assert.equal(validateApplications([old])[0].color, '')
  assert.equal(validateApplications([old])[0].starred, false)
  for (const change of [
    { color: 'red' },
    { color: null },
    { starred: 'true' },
    { starred: null },
  ]) {
    assert.throws(() => validateApplications([{ ...old, ...change }]))
  }
})
