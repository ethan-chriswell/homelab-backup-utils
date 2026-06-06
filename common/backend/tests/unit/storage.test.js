import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createStorage } from '../../src/storage.js'

// STO-1 through STO-9 — local storage
describe('local storage', () => {
  let dir
  let storage

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'storage-test-'))
    storage = createStorage({ storageType: 'local', localPath: dir })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('type is "local"', () => {
    assert.equal(storage.type, 'local')
  })

  test('save() + list() round-trips a file with correct metadata', async () => {
    const buf = Buffer.from('PK\x03\x04fake zip content')
    await storage.save('backup_2026-06-01.zip', buf)
    const list = storage.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'backup_2026-06-01.zip')
    assert.equal(list[0].size, buf.length)
    assert.ok(typeof list[0].date === 'string')
    assert.equal(list[0].source, 'local')
  })

  test('list() only returns .zip files', async () => {
    writeFileSync(join(dir, 'readme.txt'), 'not a backup')
    await storage.save('real.zip', Buffer.from('data'))
    const list = storage.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'real.zip')
  })

  test('list() sorts newest-first by modification time', async () => {
    await storage.save('a.zip', Buffer.from('a'))
    await new Promise((r) => setTimeout(r, 30))
    await storage.save('b.zip', Buffer.from('b'))
    const list = storage.list()
    assert.equal(list[0].name, 'b.zip')
    assert.equal(list[1].name, 'a.zip')
  })

  test('getStream() returns a readable stream matching the saved content', async () => {
    const content = Buffer.from('this is the backup content')
    await storage.save('data.zip', content)
    const stream = storage.getStream('data.zip')
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    assert.deepEqual(Buffer.concat(chunks), content)
  })

  test('getStream() throws with status 404 for a missing file', () => {
    assert.throws(
      () => storage.getStream('missing.zip'),
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  test('delete() removes the file from list()', async () => {
    await storage.save('to-delete.zip', Buffer.from('data'))
    assert.equal(storage.list().length, 1)
    storage.delete('to-delete.zip')
    assert.equal(storage.list().length, 0)
  })

  test('delete() is a no-op for non-existent files', () => {
    assert.doesNotThrow(() => storage.delete('nonexistent.zip'))
  })

  test('filenames with "/" are rejected', async () => {
    await assert.rejects(
      () => storage.save('sub/dir.zip', Buffer.from('x')),
      /Invalid filename/
    )
  })

  test('path traversal via ".." is rejected', () => {
    assert.throws(() => storage.getStream('../secret.txt'), /Invalid filename/)
  })

  test('path traversal via backslash is rejected', () => {
    assert.throws(() => storage.getStream('..\\secret.txt'), /Invalid filename/)
  })
})

// STO-10 through STO-13 — null storage
describe('null storage', () => {
  const storage = createStorage({ storageType: 'none' })

  test('type is "none"', () => {
    assert.equal(storage.type, 'none')
  })

  test('save() is a no-op and does not throw', async () => {
    await assert.doesNotReject(() => storage.save('any.zip', Buffer.from('x')))
  })

  test('list() returns an empty array', () => {
    assert.deepEqual(storage.list(), [])
  })

  test('getStream() throws with status 404', () => {
    assert.throws(
      () => storage.getStream('any.zip'),
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  test('delete() is a no-op and does not throw', () => {
    assert.doesNotThrow(() => storage.delete('any.zip'))
  })
})
