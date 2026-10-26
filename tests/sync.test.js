import test from 'node:test'
import assert from 'node:assert/strict'
import { addMissingApplications } from '../src/utils/sync.js'
import { blankApplication } from '../src/domain/applications.js'

test('additive sync preserves destination records and adds missing IDs exactly once', () => {
  const existing = { ...blankApplication(), company: 'Original', title: 'Engineer' }
  const edited = { ...existing, company: 'Changed elsewhere' }
  const added = { ...blankApplication(), company: 'New', title: 'Engineer' }
  const result = addMissingApplications([existing], [edited, added])
  assert.equal(result.length, 2)
  assert.equal(result[0].company, 'Original')
  assert.equal(result[1].id, added.id)
  assert.deepEqual(addMissingApplications(result, [edited, added]), result)
  assert.equal(addMissingApplications([existing], []).length, 1)
})

test('invalid incoming data fails without changing the destination', () => {
  const existing = [blankApplication()]
  assert.throws(() => addMissingApplications(existing, [{ id: 'bad', stage: 'invalid' }]))
  assert.equal(existing.length, 1)
})

test('sync merges Vue reactive records without cloning proxies or losing nested data', async () => {
  const { reactive, isProxy } = await import('vue')
  const existing = reactive([
    {
      ...blankApplication(),
      company: 'Local',
      title: 'Developer',
      attributes: [{ name: 'Team', value: 'Platform' }],
    },
  ])
  const incoming = [{ ...blankApplication(), company: 'Remote', title: 'Engineer' }]
  const merged = addMissingApplications(existing, incoming)
  assert.equal(merged.length, 2)
  assert.equal(isProxy(merged[0]), false)
  assert.equal(isProxy(merged[0].attributes), false)
  assert.deepEqual(merged[0].attributes, [{ name: 'Team', value: 'Platform' }])
  merged[0].attributes[0].value = 'Changed'
  assert.equal(existing[0].attributes[0].value, 'Platform')
})

test('Google upload accepts Vue reactive applications', async (t) => {
  const { reactive } = await import('vue')
  const storage = new Map([
    [
      'pipedin.google.token',
      JSON.stringify({ accessToken: 'test-token', expiresAt: Date.now() + 3600000 }),
    ],
  ])
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/upload/')) {
      assert.ok(options.body.includes('Reactive employer'))
      assert.ok(options.body.includes('Platform'))
      return { ok: true, json: async () => ({ id: 'test-backup' }) }
    }
    return { ok: true, json: async () => ({ files: [] }) }
  })
  const previousWindow = globalThis.window
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  globalThis.window = {
    __PIPEDIN_CONFIG__: { googleClientId: 'test-client' },
    google: { accounts: { oauth2: { initTokenClient: () => ({}) } } },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  })
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
  })
  const { syncToGoogleDrive } = await import('../src/services/googleDrive.js')
  const result = await syncToGoogleDrive(
    reactive([
      {
        ...blankApplication(),
        company: 'Reactive employer',
        title: 'Engineer',
        attributes: [{ name: 'Team', value: 'Platform' }],
      },
    ]),
  )
  assert.equal(result.added, 1)
  assert.deepEqual(result.applications, [])
})
