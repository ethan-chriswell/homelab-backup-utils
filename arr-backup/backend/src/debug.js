export const isDebug = process.env.DEBUG === 'true' || process.env.DEBUG === '1'

export function debug(module, message, data) {
  if (!isDebug) return
  const ts = new Date().toISOString()
  if (data !== undefined) {
    console.log(`[DEBUG][${ts}][${module}] ${message}`, JSON.stringify(data, null, 0))
  } else {
    console.log(`[DEBUG][${ts}][${module}] ${message}`)
  }
}

export function maskToken(token) {
  if (!token) return '(empty)'
  return `${token.slice(0, 4)}${'*'.repeat(Math.max(0, token.length - 8))}${token.slice(-4)}`
}
