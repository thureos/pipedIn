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
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/version.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"newer-build"}' }),
  )
  await page.goto(process.env.APP_URL || 'http://localhost:5173')
  await page.getByRole('status').filter({ hasText: 'A new version is available.' }).waitFor()
  await page.getByRole('button', { name: 'Dismiss update notice' }).click()
  await page.unroute('**/version.json*')
  assert.equal(await page.locator('aside').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'All applications', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Interviews', exact: true }).count(), 0)
  assert.equal(await page.locator('.stats-grid .stat').count(), 4)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Pipeline', exact: true }).click()
  await page.getByRole('button', { name: 'Exports', exact: true }).click()
  await page.getByRole('heading', { name: 'Work search activity log', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Pipeline', exact: true }).click()
  await page.getByRole('button', { name: 'Blur company names' }).click()
  assert.equal(
    await page.locator('.app-shell').evaluate((el) => el.classList.contains('privacy-blur')),
    true,
  )
  await page.getByRole('button', { name: 'Show company names' }).click()
  await page
    .getByRole('button', { name: 'Add application to Potential applications', exact: true })
    .click()
  await page.getByLabel('Opportunity name').fill('Potential role')
  await page.getByLabel('Application link').fill('https://example.com/careers/123')
  await page.getByRole('button', { name: 'Save application' }).click()
  await page.reload()
  await page
    .locator('.card-main strong')
    .filter({ hasText: /^Potential role$/ })
    .waitFor()
  let potential = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pipedin.applications.v1'))[0],
  )
  assert.equal(potential.stage, 'potential')
  assert.equal(potential.title, '')
  assert.ok(potential.createdAt)
  assert.equal(potential.stageHistory.length, 1)
  await page
    .locator('.card-main strong')
    .filter({ hasText: /^Potential role$/ })
    .click()
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
  await page.getByRole('textbox', { name: 'Company name' }).fill('Test Company')
  await page.getByLabel('Job title').fill('Frontend Engineer')
  await page.getByLabel('Employment type').selectOption('Contract')
  await page.getByLabel('Custom perk', { exact: true }).fill('Learning budget')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Add field' }).click()
  await page.getByLabel('Attribute name').fill('Recruiter')
  await page.getByLabel('Attribute value').fill('Alex')
  assert.equal(await page.getByRole('button', { name: 'Add round', exact: true }).count(), 0)
  assert.equal(await page.getByLabel('Interview stage', { exact: true }).count(), 0)
  await page.getByLabel('Pipeline stage').selectOption('interviews')
  await page.getByRole('button', { name: 'Save application' }).click()
  // Simulate a legacy record, then verify UI edits preserve its hidden interview data.
  const legacyRounds = [
    {
      id: 'legacy-round',
      name: 'Technical interview',
      person: 'Alex',
      date: '2026-10-01',
      rating: 4,
      notes: 'Follow up',
    },
  ]
  await page.evaluate((interviews) => {
    const applications = JSON.parse(localStorage.getItem('pipedin.applications.v1'))
    applications[0].interviews = interviews
    localStorage.setItem('pipedin.applications.v1', JSON.stringify(applications))
  }, legacyRounds)
  await page.reload()
  const interviewColumn = page
    .locator('.column')
    .filter({ has: page.getByRole('heading', { name: 'Interviews', exact: true }) })
  await interviewColumn.getByRole('heading', { name: 'Frontend Engineer' }).waitFor()
  assert.equal(await page.locator('.interview-preview').count(), 0)
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
  assert.deepEqual(stored[0].interviews, legacyRounds)
  assert.equal(await page.locator('.column').count(), 6)
  const ended = page
    .locator('.column')
    .filter({ has: page.getByRole('heading', { name: 'Completed', exact: true }) })
  await ended
    .locator('.card-main strong')
    .filter({ hasText: /^Test Company$/ })
    .waitFor()
  await ended.getByText('Declined', { exact: true }).waitFor()
  const jsonDownload = page.waitForEvent('download')
  await page.locator('.data-menu').filter({ hasText: 'Download JSON' }).locator('summary').click()
  await page.getByRole('button', { name: 'Download JSON', exact: false }).click()
  const jsonFile = await jsonDownload
  const backup = await fs.readFile(await jsonFile.path(), 'utf8')
  assert.deepEqual(JSON.parse(backup).applications, stored)
  await page.locator('.data-menu').filter({ hasText: 'Download JSON' }).locator('summary').click()
  await page.getByLabel('Search applications', { exact: true }).fill('no matching application')
  const csvDownload = page.waitForEvent('download')
  await page.locator('.data-menu').filter({ hasText: 'Download CSV' }).locator('summary').click()
  await page.getByRole('button', { name: 'Download CSV', exact: false }).click()
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
  await page.locator('.data-menu').filter({ hasText: 'From device' }).locator('summary').click()
  await page.getByRole('button', { name: 'From device', exact: false }).click()
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
  await page.getByLabel('Application share, job posting URL, or page source').fill(shared)
  await page.getByRole('button', { name: 'Receive application' }).click()
  let imported = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pipedin.applications.v1')),
  )
  imported = imported.find((application) => application.stage === 'potential')
  assert.equal(imported.url, '')
  assert.equal(imported.stageHistory.length, 1)
  assert.equal(imported.stageHistory[0].stage, 'potential')
  assert.notEqual(imported.stageEnteredAt, '2020-01-01T00:00:00.000Z')
  const potentialColumn = page
    .locator('.column')
    .filter({ has: page.getByRole('heading', { name: 'Potential applications', exact: true }) })
  await potentialColumn
    .locator('.application-card')
    .filter({ hasText: 'Test Company' })
    .locator('.card-main')
    .click()
  await page.getByLabel('Opportunity name').fill('Shared potential')
  await page.getByRole('button', { name: 'Save application' }).click()
  imported = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pipedin.applications.v1')).find(
      (application) => application.company === 'Shared potential',
    ),
  )
  assert.equal(imported.stage, 'potential')
  assert.equal(imported.url, '')

  const pageSource = `<html><head>
    <link rel="canonical" href="https://jobs.example.test/source-role">
    <script type="application/ld+json">{"@type":"JobPosting","title":"Source role"}</script>
  </head></html>`
  let sourceRequest
  await page.route('**/api/job-posting', async (route) => {
    sourceRequest = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        application: {
          company: 'Source Company',
          title: 'Source role',
          location: '',
          business: '',
          workplace: 'Onsite',
          employmentType: '',
          url: 'https://jobs.example.test/source-role',
          notes: '',
          perks: [],
          salaryMinimumK: null,
          salaryMaximumK: null,
        },
      }),
    })
  })
  await page.getByRole('button', { name: 'Receive / ingest' }).click()
  await page.getByLabel('Application share, job posting URL, or page source').fill(pageSource)
  await page.getByRole('button', { name: 'Receive application' }).click()
  await page.getByRole('textbox', { name: 'Company name' }).waitFor()
  assert.equal(sourceRequest.url, 'https://jobs.example.test/source-role')
  assert.equal(sourceRequest.html, pageSource)
  assert.equal(
    await page.getByRole('textbox', { name: 'Company name' }).inputValue(),
    'Source Company',
  )
  assert.equal(await page.getByLabel('Job title').inputValue(), 'Source role')
  await page.getByRole('button', { name: 'Close application' }).click()
  await page.unroute('**/api/job-posting')

  await page.getByRole('button', { name: 'Add application to Completed', exact: true }).click()
  await page.getByRole('textbox', { name: 'Company name' }).fill('Other Company')
  await page.getByLabel('Job title').fill('Product Engineer')
  await page.getByLabel('Reason for ending').selectOption('rejected')
  await page.getByRole('button', { name: 'Save application' }).click()
  const completed = page
    .locator('.column')
    .filter({ has: page.getByRole('heading', { name: 'Completed', exact: true }) })
  await completed.locator('.application-card').filter({ hasText: 'Other Company' }).waitFor()
  const reorderTarget = completed.locator('.application-card').filter({ hasText: 'Other Company' })
  await reorderTarget.scrollIntoViewIfNeeded()
  const targetBox = await reorderTarget.boundingBox()
  const dragData = await page.evaluateHandle(() => new DataTransfer())
  await completed
    .locator('.application-card')
    .filter({ hasText: 'Test Company' })
    .dispatchEvent('dragstart', { dataTransfer: dragData })
  await reorderTarget.dispatchEvent('dragover', {
    dataTransfer: dragData,
    clientY: targetBox.y + targetBox.height - 8,
  })
  await reorderTarget.dispatchEvent('drop', { dataTransfer: dragData })
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
  const moveData = await page.evaluateHandle(() => new DataTransfer())
  await completed
    .locator('.application-card')
    .filter({ hasText: 'Test Company' })
    .dispatchEvent('dragstart', { dataTransfer: moveData })
  await appliedColumn.dispatchEvent('drop', { dataTransfer: moveData })
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
  await page.screenshot({
    path: process.env.SCREENSHOT_DIR
      ? `${process.env.SCREENSHOT_DIR}/pipeline-desktop.png`
      : '/tmp/pipeline-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: process.env.SCREENSHOT_DIR
      ? `${process.env.SCREENSHOT_DIR}/pipeline-mobile.png`
      : '/tmp/pipeline-mobile.png',
    fullPage: true,
  })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  )
  await page.getByRole('button', { name: 'Condensed card view' }).click()
  assert.equal(await page.locator('.column.condensed').count(), 6)
  await page.reload()
  assert.equal(
    await page.getByRole('button', { name: 'Condensed card view' }).getAttribute('aria-pressed'),
    'true',
  )
  await page.getByRole('button', { name: 'Full card view' }).click()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('Work arrangement').selectOption('Remote')
  assert.equal(
    await page.locator('.filter-button').evaluate((el) => el.classList.contains('filter-active')),
    true,
  )
  await page.getByRole('button', { name: 'Reset filters' }).click()
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.getByRole('button', { name: `Switch to ${theme} mode` }).click()
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      )
      assert.equal(await page.locator('main').evaluate((el) => el.getBoundingClientRect().left), 0)
      assert.equal(
        await page.getByRole('button', { name: 'Settings', exact: true }).isVisible(),
        true,
      )
      assert.equal(
        await page.getByRole('button', { name: 'Exports', exact: true }).isVisible(),
        true,
      )
    }
  }
  await page.screenshot({ path: '/tmp/pipeline-dark.png', fullPage: true })
  await page.getByRole('link', { name: 'pipedIn home' }).focus()
  await page.keyboard.press('Tab')
  assert.equal(
    await page
      .getByRole('button', { name: 'Exports', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  )
  await page.emulateMedia({ media: 'print' })
  assert.equal(await page.locator('.app-header').isVisible(), false)
  await page.emulateMedia({ media: 'screen' })
  assert.deepEqual(errors, [])
  console.log(
    'Browser smoke test passed: JSON export/import, invalid import preservation, CSV current status with filters, create, custom fields, legacy interview preservation, compact header, reload persistence, outcome reason, theme persistence, and mobile overflow.',
  )
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
