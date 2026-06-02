export function loadConfig() {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    settingsPath: process.env.SETTINGS_PATH || '/data/settings.json',
  }
}
