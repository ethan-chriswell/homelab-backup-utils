import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { deepMerge, createSettingsStore } from '../../src/settings.js'

// SET-1 through SET-4
describe('deepMerge', () => {
  test('merges flat objects; source wins on collision', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 99, c: 3 })
    assert.deepEqual(result, { a: 1, b: 99, c: 3 })
  })

  test('recursively merges nested objects', () => {
    const result = deepMerge(
      { a: { x: 1, y: 2 } },
      { a: { y: 99, z: 3 } }
    )
    assert.deepEqual(result, { a: { x: 1, y: 99, z: 3 } })
  })

  test('replaces arrays rather than merging them', () => {
    const result = deepMerge({ items: [1, 2, 3] }, { items: [4, 5] })
    assert.deepEqual(result.items, [4, 5])
  })

  test('does not mutate the target object', () => {
    const target = { a: 1, nested: { b: 2 } }
    deepMerge(target, { a: 99, nested: { b: 77 } })
    assert.equal(target.a, 1)
    assert.equal(target.nested.b, 2)
  })

  test('handles null source gracefully', () => {
    const result = deepMerge({ a: 1 }, null)
    assert.equal(result.a, 1)
  })
})

// SET-5 through SET-10
describe('createSettingsStore', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('returns defaults when no file exists', () => {
    const store = createSettingsStore(join(dir, 'settings.json'), {
      defaults: { foo: 'bar', count: 0 },
    })
    assert.deepEqual(store.get(), { foo: 'bar', count: 0 })
  })

  test('save() persists JSON to disk', () => {
    const path = join(dir, 'settings.json')
    const store = createSettingsStore(path, { defaults: { val: 0 } })
    store.save({ val: 42 })
    assert.ok(existsSync(path))
    const saved = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(saved.val, 42)
  })

  test('save() deep-merges the update into current settings', () => {
    const path = join(dir, 'settings.json')
    const store = createSettingsStore(path, {
      defaults: { a: { x: 1, y: 2 }, b: 'keep' },
    })
    store.save({ a: { y: 99, z: 3 } })
    const current = store.get()
    assert.equal(current.a.x, 1)
    assert.equal(current.a.y, 99)
    assert.equal(current.a.z, 3)
    assert.equal(current.b, 'keep')
  })

  test('a second store on the same path loads persisted values', () => {
    const path = join(dir, 'settings.json')
    const store1 = createSettingsStore(path, { defaults: { val: 0 } })
    store1.save({ val: 42 })
    const store2 = createSettingsStore(path, { defaults: { val: 0 } })
    assert.equal(store2.get().val, 42)
  })

  test('defaults fill in keys missing from the persisted file', () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({ existing: 'value' }))
    const store = createSettingsStore(path, {
      defaults: { existing: 'default', extra: 'default-extra' },
    })
    assert.equal(store.get().existing, 'value')
    assert.equal(store.get().extra, 'default-extra')
  })

  test('falls back to defaults if the file contains corrupt JSON', () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, 'NOT_VALID_JSON!!!')
    const store = createSettingsStore(path, { defaults: { val: 42 } })
    assert.equal(store.get().val, 42)
  })

  test('seedFromEnv callback is invoked on first boot when no file exists', () => {
    let called = false
    createSettingsStore(join(dir, 'fresh.json'), {
      defaults: { configured: false },
      seedFromEnv: (s) => {
        called = true
        s.configured = true
      },
    })
    assert.ok(called)
  })

  test('seedFromEnv is NOT called when a settings file already exists', () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({ val: 1 }))
    let called = false
    createSettingsStore(path, {
      defaults: { val: 0 },
      seedFromEnv: () => { called = true },
    })
    assert.equal(called, false)
  })
})
