import cron from 'node-cron'
import { debug } from './debug.js'

const tasks = new Map()

function clearAll() {
  for (const task of tasks.values()) task.stop()
  tasks.clear()
}

export function updateSchedules({ global: globalSchedule, services = [] }, { onGlobal, onService }, log) {
  clearAll()

  if (globalSchedule?.enabled && globalSchedule?.cron) {
    if (!cron.validate(globalSchedule.cron)) {
      log?.warn(`Invalid global cron expression: ${globalSchedule.cron}`)
    } else {
      debug('scheduler', `starting global cron: "${globalSchedule.cron}"`)
      tasks.set('__global__', cron.schedule(globalSchedule.cron, () => {
        debug('scheduler', 'global cron fired')
        onGlobal()
      }))
      log?.info(`Global backup scheduled: ${globalSchedule.cron}`)
    }
  } else {
    debug('scheduler', 'global schedule disabled')
  }

  for (const service of services) {
    if (!service.schedule?.enabled || !service.schedule?.cron) continue
    if (!cron.validate(service.schedule.cron)) {
      log?.warn(`Invalid cron for service ${service.name}: ${service.schedule.cron}`)
      continue
    }
    const serviceId = service.id
    debug('scheduler', `starting cron for service ${service.name}: "${service.schedule.cron}"`)
    tasks.set(serviceId, cron.schedule(service.schedule.cron, () => {
      debug('scheduler', `service cron fired for ${service.name}`)
      onService(serviceId)
    }))
    log?.info(`${service.name} backup scheduled: ${service.schedule.cron}`)
  }
}
