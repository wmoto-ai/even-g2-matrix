/**
 * Simple event log — writes to #event-log element and console.
 */
export function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString('ja-JP')
  const line = `[${timestamp}] ${message}`
  console.log(line)

  const logEl = document.getElementById('event-log')
  if (logEl) {
    logEl.textContent = line + '\n' + (logEl.textContent ?? '')
    const lines = logEl.textContent.split('\n')
    if (lines.length > 100) {
      logEl.textContent = lines.slice(0, 100).join('\n')
    }
  }
}
