// Optional smoke test: requires Playwright and Chromium in the test environment.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
;(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/version.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"newer-build"}' }),
  )
  await page.goto(process.env.APP_URL || 'http://localhost:5173')
  await page.getByRole('status').filter({ hasText: 'A new version is available.' }).waitFor()
  await page.getByRole('button', { name: 'Dismiss update notice' }).click()
  await page.unroute('**/version.json*')
  await page
    .getByRole('button', { name: 'Add application to Potential applications', exact: true })
    .click()
  await page.getByLabel('Opportunity name').fill('Potential role')
  await page.getByLabel('Application link').fill('https://example.com/careers/123')
  await page.getByRole('button', { name: 'Save application' }).click()
  await page.reload()
  await page.getByText('Potential role', { exact: true }).waitFor()
  let potential = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pipedin.applications.v1'))[0],
  )
  assert.equal(potential.stage, 'potential')
  assert.equal(potential.title, '')
  assert.ok(potential.createdAt)
  assert.equal(potential.stageHistory.length, 1)
  await page.getByText('Potential role', { exact: true }).click()
  await page.getByLabel('Pipeline stage').selectOption('applied')
  await page.getByLabel('Job title').fill('Potential engineer')
  await page.getByRole('button', { name: 'Save application' }).click()
  potential = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pipedin.applications.v1'))[0],
  )
  assert.equal(potential.stageHistory.length, 2)
  assert.equal(potential.stageHistory[0].stage, 'potential')
  assert.equal(potential.stageHistory[1].stage, 'applied')
  await page.getByRole('heading', { name: 'Potential engineer' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Add application', exact: true }).first().click()
  await page.getByLabel('Company name').fill('Test Company')
  await page.getByLabel('Job title').fill('Frontend Engineer')
  await page.getByLabel('Employment type').selectOption('Contract')
  await page.getByLabel('Custom perk', { exact: true }).fill('Learning budget')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Add field' }).click()
  await page.getByLabel('Attribute name').fill('Recruiter')
  await page.getByLabel('Attribute value').fill('Alex')
  await page.locator('.dialog-tabs button').nth(1).click()
  await page.getByRole('button', { name: 'Add round' }).click()
  await page.getByLabel('Interview stage').fill('Technical interview')
  await page.getByLabel('Person interviewed with').fill('Alex')
  await page.getByRole('button', { name: 'Rate 4 out of 5 stars' }).click()
  await page.getByRole('button', { name: 'Save application' }).click()
  await page.reload()
  await page.getByRole('heading', { name: 'Frontend Engineer' }).waitFor()
  let stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pipedin.applications.v1')),
  )
  assert.equal(stored[0].employmentType, 'Contract')
  assert.ok(stored[0].createdAt)
  assert.ok(stored[0].updatedAt)
  assert.ok(stored[0].stageEnteredAt)
  assert.equal(stored[0].interviews[0].rating, 4)
  assert.equal(stored[0].attributes[0].value, 'Alex')
  assert.ok(stored[0].perks.includes('Learning budget'))
  await page.getByRole('heading', { name: 'Frontend Engineer' }).click()
  await page.getByLabel('Pipeline stage').selectOption('ended')
  await page.getByLabel('Reason for ending').selectOption('declined')
  await page.getByLabel('Reason for declining').fill('Another opportunity')
  await page.getByRole('button', { name: 'Save application' }).click()
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pipedin.applications.v1')))
  assert.equal(stored[0].stageHistory.length, 2)
  assert.equal(stored[0].reasons.declined, 'Another opportunity')
  assert.equal(await page.locator('.column').count(), 6)
  const ended = page
    .locator('.column')
    .filter({ has: page.getByRole('heading', { name: 'Completed', exact: true }) })
  await ended.getByText('Test Company', { exact: true }).waitFor()
  await ended.getByText('Declined', { exact: true }).waitFor()
  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
  const jsonFile = await jsonDownload
  const backup = await fs.readFile(await jsonFile.path(), 'utf8')
  assert.deepEqual(JSON.parse(backup).applications, stored)
  await page.getByLabel('Search applications', { exact: true }).fill('no matching application')
  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const csvFile = await csvDownload
  const csv = await fs.readFile(await csvFile.path(), 'utf8')
  assert.ok(csv.includes('"Test Company"'))
  assert.ok(csv.includes('"Offer declined"'))
  assert.ok(csv.includes('"Current status"'))
  assert.ok(csv.includes('"Employment type"'))
  assert.ok(csv.includes('"Contract"'))
  await page.getByLabel('Search applications', { exact: true }).fill('')
  page.once('dialog', (dialog) => dialog.accept())
  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click()
  await (
    await fileChooser
  ).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await page.getByRole('status').filter({ hasText: 'Backup restored.' }).waitFor()
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('pipedin.applications.v1'))),
    stored,
  )
  await page.getByLabel('Import JSON backup file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":1,"applications":[{}]}'),
  })
  await page.getByRole('status').filter({ hasText: 'invalid' }).waitFor()
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('pipedin.applications.v1'))),
    stored,
  )
  const shared = await page.evaluate(() => {
    const application = JSON.parse(localStorage.getItem('pipedin.applications.v1'))[0]
    application.stage = 'interviews'
    application.stageEnteredAt = '2020-01-01T00:00:00.000Z'
    application.stageHistory = [{ stage: 'interviews', enteredAt: '2020-01-01T00:00:00.000Z' }]
    application.url = ''
    const bytes = new TextEncoder().encode(JSON.stringify(application))
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })
  await page.getByRole('button', { name: 'Receive / ingest' }).click()
  await page.getByLabel('Shared application or job posting URL').fill(shared)
  await page.getByRole('button', { name: 'Receive application' }).click()
  await page.getByLabel('Opportunity name').waitFor()
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('pipedin.applications.v1'))),
    stored,
  )
  await page.getByRole('button', { name: 'Close application', exact: true }).click()
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('pipedin.applications.v1'))),
    stored,
  )
  await page.getByRole('button', { name: 'Receive / ingest' }).click()
  await page.getByLabel('Shared application or job posting URL').fill(shared)
  await page.getByRole('button', { name: 'Receive application' }).click()
  await page.getByLabel('Opportunity name').fill('Shared potential')
  await page.getByLabel('Application link').fill('https://example.com/shared-role')
  await page.getByLabel('Notes', { exact: true }).fill('Reviewed before saving')
  await page.getByRole('button', { name: 'Save application' }).click()
  const imported = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pipedin.applications.v1')).find(
      (application) => application.company === 'Shared potential',
    ),
  )
  assert.equal(imported.stage, 'potential')
  assert.equal(imported.url, 'https://example.com/shared-role')
  assert.equal(imported.notes, 'Reviewed before saving')
  assert.equal(imported.stageHistory.length, 1)
  assert.equal(imported.stageHistory[0].stage, 'potential')
  assert.notEqual(imported.stageEnteredAt, '2020-01-01T00:00:00.000Z')

  await page.getByRole('button', { name: 'Add application to Completed', exact: true }).click()
  await page.getByLabel('Company name').fill('Other Company')
  await page.getByLabel('Job title').fill('Product Engineer')
  await page.getByLabel('Reason for ending').selectOption('rejected')
  await page.getByRole('button', { name: 'Save application' }).click()
  const completed = page
    .locator('.column')
    .filter({ has: page.getByRole('heading', { name: 'Completed', exact: true }) })
  await completed.locator('.application-card').filter({ hasText: 'Other Company' }).waitFor()
  await completed
    .locator('.application-card')
    .filter({ hasText: 'Test Company' })
    .dragTo(completed.locator('.application-card').filter({ hasText: 'Other Company' }))
  let completedOrder = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pipedin.applications.v1'))
      .filter((application) =>
        ['accepted', 'declined', 'rejected', 'withdrawn'].includes(application.stage),
      )
      .map((application) => application.company),
  )
  assert.deepEqual(completedOrder, ['Other Company', 'Test Company'])
  await page.reload()
  completedOrder = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pipedin.applications.v1'))
      .filter((application) =>
        ['accepted', 'declined', 'rejected', 'withdrawn'].includes(application.stage),
      )
      .map((application) => application.company),
  )
  assert.deepEqual(completedOrder, ['Other Company', 'Test Company'])
  const appliedColumn = page
    .locator('.column')
    .filter({ has: page.getByRole('heading', { name: 'Applied', exact: true }) })
  await completed
    .locator('.application-card')
    .filter({ hasText: 'Test Company' })
    .dragTo(appliedColumn.locator('.column-line'))
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('pipedin.applications.v1')).find(
          (application) => application.company === 'Test Company',
        ).stage,
    ),
    'applied',
  )
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.reload()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.evaluate(() => localStorage.removeItem('pipedin.applications.v1'))
  await page.reload()
  await page.getByRole('button', { name: 'Explore sample pipeline' }).click()
  await page.screenshot({ path: '/app/test-results/pipeline-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/app/test-results/pipeline-mobile.png', fullPage: true })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  )
  assert.deepEqual(errors, [])
  console.log(
    'Browser smoke test passed: JSON export/import, invalid import preservation, CSV current status with filters, create, custom fields, interview rating, reload persistence, outcome reason, theme persistence, and mobile overflow.',
  )
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
