import cron from 'node-cron'
import { debug } from './debug.js'

let task = null

export function updateSchedule(schedule, onTick, log) {
  if (task) {
    debug('scheduler', 'stopping existing cron task')
    task.stop()
    task = null
  }

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
  task = cron.schedule(schedule.cron, () => {
    debug('scheduler', `cron fired: ${schedule.cron}`)
    onTick()
  })
  log?.info(`Backup scheduled: ${schedule.cron}`)
}
