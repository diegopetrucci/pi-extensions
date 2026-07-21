import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const moduleCache = new Map()
const transpileRoot = await mkdtemp(path.join(repoRoot, '.tmp-openai-usage-'))

after(async () => {
  await rm(transpileRoot, { recursive: true, force: true })
})

async function importTsModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath)
  const cached = moduleCache.get(absolutePath)
  if (cached) return cached

  const sourceText = await readFile(absolutePath, 'utf8')
  const transpiled = ts.transpileModule(sourceText, {
    fileName: absolutePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })

  const diagnostics = transpiled.diagnostics ?? []
  assert.equal(
    diagnostics.length,
    0,
    diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n'),
  )

  const outputPath = path.join(transpileRoot, relativePath).replace(/\.ts$/, '.mjs')
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, transpiled.outputText)
  assert.equal(existsSync(outputPath), true)

  const loaded = await import(pathToFileURL(outputPath).href)
  moduleCache.set(absolutePath, loaded)
  return loaded
}

const {
  fetchOpenAICodexUsage,
  formatUsageSummary,
  isOpenAICodexProvider,
} = await importTsModule('extensions/minimal-footer/openai-usage.ts')

function withPatchedFetch(mockFetch, run) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockFetch
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = originalFetch
    })
}

test('minimal-footer openai usage detects provider and formats enabled usage windows', () => {
  assert.equal(isOpenAICodexProvider('openai-codex'), true)
  assert.equal(isOpenAICodexProvider('openai'), false)
  assert.equal(isOpenAICodexProvider(undefined), false)

  const snapshot = {
    primary: { usedPercent: 12.4 },
    secondary: { usedPercent: 67.6 },
    fetchedAt: 123,
  }
  const windows = {
    primary: { enabled: true, label: '5h' },
    secondary: { enabled: true, label: '7d' },
  }

  assert.equal(formatUsageSummary(snapshot, windows), '5h 12% · 7d 68%')
  assert.equal(
    formatUsageSummary(snapshot, {
      primary: { enabled: false, label: '5h' },
      secondary: windows.secondary,
    }),
    '7d 68%',
  )
  assert.equal(
    formatUsageSummary(snapshot, {
      primary: windows.primary,
      secondary: { enabled: false, label: '7d' },
    }),
    '5h 12%',
  )
  assert.equal(formatUsageSummary({ primary: { resetAt: 1 }, fetchedAt: 123 }, windows), undefined)
  assert.equal(formatUsageSummary(undefined, windows), undefined)
})

test('minimal-footer openai usage skips fetch when no token is available', async () => {
  let fetchCalls = 0
  const authStorage = {
    async getApiKey(providerId, options) {
      assert.equal(providerId, 'openai-codex')
      assert.deepEqual(options, { includeFallback: false })
      return undefined
    },
    reload() {
      throw new Error('reload should not be called without a token')
    },
    get() {
      throw new Error('get should not be called without a token')
    },
  }

  await withPatchedFetch(async () => {
    fetchCalls += 1
    throw new Error('fetch should not be called without a token')
  }, async () => {
    const snapshot = await fetchOpenAICodexUsage(authStorage)
    assert.equal(snapshot, undefined)
    assert.equal(fetchCalls, 0)
  })
})

test('minimal-footer openai usage adds OAuth account header and normalizes usage data', async () => {
  const originalDateNow = Date.now
  const authCalls = []
  const fetchCalls = []
  const authStorage = {
    async getApiKey(providerId, options) {
      authCalls.push(['getApiKey', providerId, options])
      return 'token-123'
    },
    reload() {
      authCalls.push(['reload'])
    },
    get(providerId) {
      authCalls.push(['get', providerId])
      return { type: 'oauth', accountId: ' acct-456 ' }
    },
  }

  Date.now = () => 987654321
  try {
    await withPatchedFetch(async (url, init) => {
      fetchCalls.push({ url, init })
      return {
        ok: true,
        async json() {
          return {
            rate_limit: {
              primary_window: {
                used_percent: -5,
                reset_at: 123,
              },
              secondary_window: {
                used_percent: 150.2,
                reset_at: 456.789,
              },
            },
          }
        },
      }
    }, async () => {
      const snapshot = await fetchOpenAICodexUsage(authStorage, { timeoutMs: 321 })
      assert.deepEqual(snapshot, {
        primary: { usedPercent: 0, resetAt: 123000 },
        secondary: { usedPercent: 100, resetAt: 456789 },
        fetchedAt: 987654321,
      })
    })
  } finally {
    Date.now = originalDateNow
  }

  assert.deepEqual(authCalls, [
    ['getApiKey', 'openai-codex', { includeFallback: false }],
    ['reload'],
    ['get', 'openai-codex'],
  ])
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'https://chatgpt.com/backend-api/wham/usage')
  assert.deepEqual(fetchCalls[0].init.headers, {
    Authorization: 'Bearer token-123',
    Accept: 'application/json',
    'ChatGPT-Account-Id': 'acct-456',
  })
  assert.ok(fetchCalls[0].init.signal instanceof AbortSignal)
})

test('minimal-footer openai usage supports modelRegistry auth and stored OAuth account ids', async (t) => {
  const authDir = await mkdtemp(path.join(repoRoot, '.tmp-openai-auth-'))
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = authDir
  t.after(async () => {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir
    await rm(authDir, { recursive: true, force: true })
  })

  await writeFile(
    path.join(authDir, 'auth.json'),
    JSON.stringify({
      'openai-codex': {
        type: 'oauth',
        access: 'stored-token-should-not-be-used',
        refresh: 'refresh-token',
        expires: Date.now() + 60_000,
        accountId: ' acct-registry ',
      },
    }),
  )

  const authCalls = []
  const modelRegistry = {
    token: 'runtime-token-456',
    async getProviderAuth(providerId) {
      authCalls.push([providerId, this.token])
      return { auth: { apiKey: this.token } }
    },
  }

  await withPatchedFetch(async (_url, init) => {
    assert.deepEqual(init.headers, {
      Authorization: 'Bearer runtime-token-456',
      Accept: 'application/json',
      'ChatGPT-Account-Id': 'acct-registry',
    })
    return {
      ok: true,
      async json() {
        return {}
      },
    }
  }, async () => {
    const snapshot = await fetchOpenAICodexUsage(modelRegistry)
    assert.deepEqual(snapshot, {
      primary: undefined,
      secondary: undefined,
      fetchedAt: snapshot.fetchedAt,
    })
  })

  assert.deepEqual(authCalls, [['openai-codex', 'runtime-token-456']])
})

test('minimal-footer openai usage omits the account header for non-oauth credentials', async () => {
  const authStorage = {
    async getApiKey() {
      return 'token-123'
    },
    reload() {},
    get() {
      return { type: 'api_key', accountId: 'acct-should-not-send' }
    },
  }

  await withPatchedFetch(async (_url, init) => {
    assert.deepEqual(init.headers, {
      Authorization: 'Bearer token-123',
      Accept: 'application/json',
    })
    return {
      ok: true,
      async json() {
        return {}
      },
    }
  }, async () => {
    const snapshot = await fetchOpenAICodexUsage(authStorage)
    assert.deepEqual(snapshot, {
      primary: undefined,
      secondary: undefined,
      fetchedAt: snapshot.fetchedAt,
    })
  })
})

test('minimal-footer openai usage throws on non-ok responses and clears its timeout', async () => {
  const realClearTimeout = globalThis.clearTimeout
  const cleared = []
  const authStorage = {
    async getApiKey() {
      return 'token-123'
    },
    reload() {},
    get() {
      return undefined
    },
  }

  globalThis.clearTimeout = (handle) => {
    cleared.push(handle)
    return realClearTimeout(handle)
  }

  try {
    await withPatchedFetch(async () => ({ ok: false, status: 503 }), async () => {
      await assert.rejects(
        fetchOpenAICodexUsage(authStorage, { timeoutMs: 321 }),
        /Usage request failed: 503/,
      )
    })
  } finally {
    globalThis.clearTimeout = realClearTimeout
  }

  assert.equal(cleared.length, 1)
})

test('minimal-footer openai usage aborts on timeout and clears the scheduled timer', async () => {
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  const timers = []
  let fetchSignal
  const authStorage = {
    async getApiKey() {
      return 'token-123'
    },
    reload() {},
    get() {
      return undefined
    },
  }

  globalThis.setTimeout = (callback, ms, ...args) => {
    const handle = {
      callback: () => callback(...args),
      cleared: false,
      ms,
    }
    timers.push(handle)
    return handle
  }
  globalThis.clearTimeout = (handle) => {
    handle.cleared = true
  }

  try {
    await withPatchedFetch((_url, init) => {
      fetchSignal = init.signal
      return new Promise((resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new Error('aborted by timeout')),
          { once: true },
        )
      })
    }, async () => {
      const usagePromise = fetchOpenAICodexUsage(authStorage, { timeoutMs: 321 })
      await Promise.resolve()
      await Promise.resolve()

      assert.equal(timers.length, 1)
      assert.equal(timers[0].ms, 321)
      assert.equal(fetchSignal.aborted, false)

      timers[0].callback()

      await assert.rejects(usagePromise, /aborted by timeout/)
    })
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }

  assert.ok(fetchSignal instanceof AbortSignal)
  assert.equal(fetchSignal.aborted, true)
  assert.equal(timers[0].cleared, true)
})
