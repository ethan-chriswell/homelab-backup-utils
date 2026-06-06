import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeToDelete } from '../../src/routes.js'

// Helpers
function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function makeBackups(count, startDaysAgo = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `backup_${i + 1}.zip`,
    time: daysAgo(startDaysAgo + i),
    size: 1024,
  }))
}

// ARR-RET-1
describe('no rules', () => {
  test('returns empty array when keepLast=0 and keepDays=0', () => {
    const backups = makeBackups(5)
    const result = computeToDelete(backups, { keepLast: 0, keepDays: 0 })
    assert.deepEqual(result, [])
  })
})

// ARR-RET-2
describe('keepLast rule', () => {
  test('keeps the N newest; deletes the rest', () => {
    const backups = makeBackups(5)
    const toDelete = computeToDelete(backups, { keepLast: 3, keepDays: 0 })
    assert.equal(toDelete.length, 2)
    // The two oldest (indices 3 and 4 when sorted newest-first) should be deleted
    assert.deepEqual(
      toDelete.map((b) => b.id),
      [4, 5]
    )
  })

  test('returns nothing when the list is shorter than keepLast', () => {
    const backups = makeBackups(2)
    const toDelete = computeToDelete(backups, { keepLast: 5, keepDays: 0 })
    assert.equal(toDelete.length, 0)
  })

  test('keepLast=1 keeps exactly the first backup in the array', () => {
    const backups = makeBackups(4)
    const toDelete = computeToDelete(backups, { keepLast: 1, keepDays: 0 })
    assert.equal(toDelete.length, 3)
    assert.ok(!toDelete.find((b) => b.id === 1))
  })
})

// ARR-RET-3
describe('keepDays rule', () => {
  test('keeps backups newer than keepDays; deletes older ones', () => {
    const recent = [
      { id: 1, name: 'a.zip', time: daysAgo(1) },
      { id: 2, name: 'b.zip', time: daysAgo(2) },
    ]
    const old = [
      { id: 3, name: 'c.zip', time: daysAgo(8) },
      { id: 4, name: 'd.zip', time: daysAgo(15) },
    ]
    const toDelete = computeToDelete([...recent, ...old], { keepLast: 0, keepDays: 7 })
    assert.deepEqual(
      toDelete.map((b) => b.id).sort(),
      [3, 4]
    )
  })

  test('returns nothing when all backups are within keepDays', () => {
    const backups = [
      { id: 1, name: 'a.zip', time: daysAgo(1) },
      { id: 2, name: 'b.zip', time: daysAgo(3) },
    ]
    const toDelete = computeToDelete(backups, { keepLast: 0, keepDays: 30 })
    assert.equal(toDelete.length, 0)
  })
})

// ARR-RET-4 — either rule saves = not deleted
describe('both rules active (union semantics)', () => {
  test('a backup kept by keepLast is not deleted even if outside keepDays window', () => {
    // keepLast=3, keepDays=7
    // Backups sorted newest-first; indices 0,1,2 are saved by keepLast
    const backups = [
      { id: 1, name: 'a.zip', time: daysAgo(30) }, // old, but index 0 → saved by keepLast
      { id: 2, name: 'b.zip', time: daysAgo(40) }, // index 1
      { id: 3, name: 'c.zip', time: daysAgo(50) }, // index 2
      { id: 4, name: 'd.zip', time: daysAgo(60) }, // index 3, old → both rules delete it
    ]
    const toDelete = computeToDelete(backups, { keepLast: 3, keepDays: 7 })
    assert.deepEqual(toDelete.map((b) => b.id), [4])
  })

  test('a backup within keepDays is not deleted even if beyond keepLast', () => {
    // keepLast=2, keepDays=30; backup at index 2 is recent
    const backups = [
      { id: 1, name: 'a.zip', time: daysAgo(1) },  // kept by count (0)
      { id: 2, name: 'b.zip', time: daysAgo(2) },  // kept by count (1)
      { id: 3, name: 'c.zip', time: daysAgo(3) },  // NOT kept by count (index 2), but within 30 days
    ]
    const toDelete = computeToDelete(backups, { keepLast: 2, keepDays: 30 })
    assert.equal(toDelete.length, 0)
  })
})

// ARR-RET-5 — only age rule
describe('only keepDays active (keepLast=0)', () => {
  test('applies age rule when keepLast is zero', () => {
    const backups = [
      { id: 1, name: 'a.zip', time: daysAgo(2) },
      { id: 2, name: 'b.zip', time: daysAgo(20) },
    ]
    const toDelete = computeToDelete(backups, { keepLast: 0, keepDays: 10 })
    assert.deepEqual(toDelete.map((b) => b.id), [2])
  })
})

// ARR-RET-6 — backups with no date field and only age rule active
describe('backups without date fields', () => {
  test('backup with no time field is returned for deletion when only the age rule is active', () => {
    // When dateStr is undefined, savedByAge is false (age rule cannot save it),
    // so no rule saves the backup and it is marked for deletion.
    const backups = [
      { id: 1, name: 'a.zip' }, // no time field
    ]
    const toDelete = computeToDelete(backups, { keepLast: 0, keepDays: 1 })
    assert.equal(toDelete.length, 1)
  })

  test('backup with no time field is kept when the count rule saves it', () => {
    const backups = [
      { id: 1, name: 'a.zip' }, // no time field, but index 0 → saved by keepLast=1
    ]
    const toDelete = computeToDelete(backups, { keepLast: 1, keepDays: 1 })
    assert.equal(toDelete.length, 0)
  })
})
