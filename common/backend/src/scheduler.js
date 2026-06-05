import cron from 'node-cron'
import { debug } from './debug.js'

const tasks = new Map()

function clearAll() {
  for (const task of tasks.values()) task.stop()
  tasks.clear()
}

// Single-schedule variant for services with one global schedule
export function updateSchedule(schedule, onTick, log) {
  clearAll()

  if (!schedule?.enabled) {
    debug('scheduler', 'schedule disabled — no cron task started')
    return
  }

  if (!schedule?.cron) {
    debug('scheduler', 'schedule enabled but no cron expression set')
    return
  }

  debug('scheduler', `validating cron expression: "${schedule.cron}"`)
  if (!cron.validate(schedule.cron)) {
    log?.warn(`Invalid cron expression: ${schedule.cron}`)
    debug('scheduler', `cron expression "${schedule.cron}" is invalid — task not started`)
    return
  }

  debug('scheduler', `starting cron task with expression: "${schedule.cron}"`)
  tasks.set('_single', cron.schedule(schedule.cron, () => {
    debug('scheduler', `cron fired: ${schedule.cron}`)
    onTick()
  }))
  log?.info(`Backup scheduled: ${schedule.cron}`)
}

// Multi-schedule variant for services with per-target and global schedules
// schedules: [{ id, name, enabled, cron, serviceId }]
// serviceId = null/undefined → backup all services
export function updateSchedules(schedules = [], { onGlobal, onService }, log) {
  clearAll()

  for (const schedule of schedules) {
    if (!schedule.enabled || !schedule.cron) continue
    if (!cron.validate(schedule.cron)) {
      log?.warn(`Invalid cron for schedule "${schedule.name}": ${schedule.cron}`)
      continue
    }

    const key = schedule.id
    const serviceId = schedule.serviceId || null
    const retention = schedule.retention || null

    if (!serviceId) {
      debug('scheduler', `global schedule "${schedule.name}": "${schedule.cron}"`)
      tasks.set(key, cron.schedule(schedule.cron, () => {
        debug('scheduler', `global schedule fired: "${schedule.name}"`)
        onGlobal(retention)
      }))
      log?.info(`Scheduled (all services): "${schedule.name}" ${schedule.cron}`)
    } else {
      debug('scheduler', `service schedule "${schedule.name}" → ${serviceId}: "${schedule.cron}"`)
      tasks.set(key, cron.schedule(schedule.cron, () => {
        debug('scheduler', `service schedule fired: "${schedule.name}" → ${serviceId}`)
        onService(serviceId, retention)
      }))
      log?.info(`Scheduled (${serviceId}): "${schedule.name}" ${schedule.cron}`)
    }
  }
}
