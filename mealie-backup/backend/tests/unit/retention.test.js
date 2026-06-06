import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeToDelete } from '../../src/routes.js'

// Helpers
function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

// MEA-RET-1
describe('no rules', () => {
  test('returns empty array when keepLast=0 and keepDays=0', () => {
    const backups = [
      { name: 'a.zip', date: daysAgo(1) },
      { name: 'b.zip', date: daysAgo(2) },
    ]
    assert.deepEqual(computeToDelete(backups, { keepLast: 0, keepDays: 0 }), [])
  })
})

// MEA-RET-2
describe('keepLast rule', () => {
  test('keeps the N newest; deletes the rest', () => {
    const backups = [
      { name: 'a.zip', date: daysAgo(1) },
      { name: 'b.zip', date: daysAgo(2) },
      { name: 'c.zip', date: daysAgo(3) },
      { name: 'd.zip', date: daysAgo(4) },
    ]
    const toDelete = computeToDelete(backups, { keepLast: 2, keepDays: 0 })
    assert.equal(toDelete.length, 2)
    assert.ok(!toDelete.find((b) => b.name === 'a.zip'))
    assert.ok(!toDelete.find((b) => b.name === 'b.zip'))
  })

  test('returns nothing when list is shorter than keepLast', () => {
    const backups = [{ name: 'a.zip', date: daysAgo(1) }]
    const toDelete = computeToDelete(backups, { keepLast: 5, keepDays: 0 })
    assert.equal(toDelete.length, 0)
  })
})

// MEA-RET-3
describe('keepDays rule', () => {
  test('keeps recent backups; deletes old ones', () => {
    const backups = [
      { name: 'recent.zip', date: daysAgo(2) },
      { name: 'old.zip', date: daysAgo(30) },
    ]
    const toDelete = computeToDelete(backups, { keepLast: 0, keepDays: 7 })
    assert.equal(toDelete.length, 1)
    assert.equal(toDelete[0].name, 'old.zip')
  })

  test('returns nothing when all backups are within keepDays', () => {
    const backups = [
      { name: 'a.zip', date: daysAgo(1) },
      { name: 'b.zip', date: daysAgo(5) },
    ]
    assert.equal(computeToDelete(backups, { keepLast: 0, keepDays: 30 }).length, 0)
  })
})

// MEA-RET-4 — either rule saves = not deleted
describe('both rules active', () => {
  test('a recent backup beyond keepLast is still kept by the age rule', () => {
    const backups = [
      { name: 'a.zip', date: daysAgo(1) },
      { name: 'b.zip', date: daysAgo(2) },
      { name: 'c.zip', date: daysAgo(3) }, // index 2 → beyond keepLast=2, but within 30 days
    ]
    const toDelete = computeToDelete(backups, { keepLast: 2, keepDays: 30 })
    assert.equal(toDelete.length, 0)
  })

  test('only deletes backups that both rules agree to delete', () => {
    const backups = [
      { name: 'a.zip', date: daysAgo(1) },   // kept by count (0)
      { name: 'b.zip', date: daysAgo(2) },   // kept by count (1)
      { name: 'c.zip', date: daysAgo(60) },  // NOT kept by count, NOT in 30 days → delete
    ]
    const toDelete = computeToDelete(backups, { keepLast: 2, keepDays: 30 })
    assert.equal(toDelete.length, 1)
    assert.equal(toDelete[0].name, 'c.zip')
  })
})
